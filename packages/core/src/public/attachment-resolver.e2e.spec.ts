import { afterEach, describe, expect, it } from "vitest";
import { InlineAttachmentResolver } from "../adapters/attachment/inline-attachment-resolver";
import { SignedUrlAttachmentResolver } from "../adapters/attachment/signed-url-attachment-resolver";
import { InMemoryArtifactStorage } from "../adapters/storage/in-memory-artifact-storage";
import { InMemorySessionStorage } from "../adapters/storage/in-memory-session-storage";
import { SessionId } from "../common/identity/session-id";
import { SessionRevision } from "../common/revision/session-revision";
import { AttachmentResolver } from "../contracts/attachment-resolver";
import { AgentDefinition } from "../domain/agent/agent-definition";
import { AgentDescription } from "../domain/agent/agent-description";
import { AgentExecutionPolicies } from "../domain/agent/agent-execution-policies";
import { AgentName } from "../domain/agent/agent-name";
import { DeclaredAgent } from "../domain/agent/declared-agent";
import { UserMessageReceived } from "../domain/event/catalog/user-message-received";
import { AttachmentProjection } from "../domain/model/attachment-projection";
import { AttachmentReference } from "../domain/model/attachment-reference";
import type { AttachmentRequest } from "../domain/model/attachment-request";
import { UnsupportedCapabilityError } from "../domain/model/errors/unsupported-capability.error";
import { LlmModel } from "../domain/model/llm-model";
import { MediaPart } from "../domain/model/media-part";
import { ModelCapabilities } from "../domain/model/model-capabilities";
import { ModelCapability } from "../domain/model/model-capability";
import { ModelChunk } from "../domain/model/model-chunk";
import { ModelContextWindow } from "../domain/model/model-context-window";
import { ModelDescriptor } from "../domain/model/model-descriptor";
import { ModelIdentity } from "../domain/model/model-identity";
import { ModelRequest } from "../domain/model/model-request";
import { UserMessage } from "../domain/model/user-message";
import { PromptInstructions } from "../domain/prompt/prompt-instructions";
import { SessionContext } from "../domain/run/session-context";
import { AskInput } from "../domain/session/ask-input";
import { RuntimeOptions } from "../runtime/composition/runtime-options";
import { AgentRunCommand } from "../runtime/run/agent-run-command";
import { FakeClock } from "../support/fake-clock";
import { SequenceIdGenerator } from "../support/sequence-id-generator";
import { AdkRuntimeHost } from "./adk-runtime-host";

const SUPPORT = AgentName.from("support");
const PIXEL = "iVBORw0KGgo=";
const RECEIPT = AttachmentReference.external("upload-42", "image/png");

/** Records every request, so a test can assert what the model was actually shown. */
class SeeingModel extends LlmModel {
	public readonly requests: ModelRequest[] = [];

	public constructor(private readonly fetchesUrls: boolean = false) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", this.fetchesUrls ? "fetching" : "seeing"),
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.of([
				[ModelCapability.MEDIA_INPUT, true],
				[ModelCapability.MEDIA_URL, this.fetchesUrls],
			]),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		this.requests.push(request);
		yield ModelChunk.text(`answer ${this.requests.length}`);
		yield ModelChunk.finish("stop");
	}

	public get lastUserMessage(): UserMessage | undefined {
		const messages = this.requests[this.requests.length - 1]?.messages ?? [];
		const users = messages.filter((message): message is UserMessage => message instanceof UserMessage);
		return users[users.length - 1];
	}
}

function agentOf(model: LlmModel): DeclaredAgent {
	const definition = AgentDefinition.of(
		SUPPORT,
		AgentDescription.from("support agent", SUPPORT.value),
		model,
		PromptInstructions.from("Be brief."),
		AgentExecutionPolicies.of(),
	);
	return new DeclaredAgent(definition, "SupportAgent");
}

async function messagesOf(storage: InMemorySessionStorage, sessionId: SessionId): Promise<UserMessageReceived[]> {
	const found: UserMessageReceived[] = [];
	for await (const stored of storage.readEvents(SessionContext.fromSessionId(sessionId), SessionRevision.initial())) {
		if (stored.event instanceof UserMessageReceived) found.push(stored.event);
	}
	return found;
}

function askWith(references: readonly AttachmentReference[], sessionId?: SessionId): AgentRunCommand {
	return new AgentRunCommand(SUPPORT, AskInput.with("what is this?", [], sessionId, undefined, references));
}

const host = new AdkRuntimeHost();

afterEach(async () => {
	await host.stop();
});

async function startedWith(model: LlmModel, resolver?: AttachmentResolver, storage = new InMemorySessionStorage()) {
	const runtime = await host.start(
		[agentOf(model)],
		storage,
		new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
		new FakeClock(),
		new SequenceIdGenerator(),
		RuntimeOptions.from({ attachments: resolver }),
	);
	return { runtime, storage };
}

describe("a question naming a file the application owns", () => {
	it("records the id in the journal and never the bytes, which stay with the application", async () => {
		const model = new SeeingModel();
		const { runtime, storage } = await startedWith(
			model,
			new InlineAttachmentResolver(async () => MediaPart.image("image/png", PIXEL)),
		);

		const result = await runtime.runner.ask(askWith([RECEIPT]));

		const [message] = await messagesOf(storage, result.sessionId);
		expect(message?.attachments[0]?.externalId).toBe("upload-42");
		expect(JSON.stringify(message)).not.toContain(PIXEL);
	});

	it("shows the model the bytes the application fetched, on the very first turn", async () => {
		const model = new SeeingModel();
		const { runtime } = await startedWith(
			model,
			new InlineAttachmentResolver(async (externalId) =>
				externalId === "upload-42" ? MediaPart.image("image/png", PIXEL) : undefined,
			),
		);

		await runtime.runner.ask(askWith([RECEIPT]));

		expect(model.lastUserMessage?.hasMedia).toBe(true);
		expect(model.lastUserMessage?.media[0]?.base64).toBe(PIXEL);
	});

	it("asks the application again on every turn, which is what makes a fresh address possible", async () => {
		const model = new SeeingModel(true);
		let minted = 0;
		const { runtime } = await startedWith(
			model,
			new SignedUrlAttachmentResolver(async (externalId) => {
				minted += 1;
				return `https://files.example/${externalId}?sig=${minted}`;
			}),
		);

		const first = await runtime.runner.ask(askWith([RECEIPT]));
		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("and now?", first.sessionId)));

		const shown = model.requests[1]?.messages.filter((message): message is UserMessage => message instanceof UserMessage);
		expect(shown?.[0]?.media[0]?.url).toBe("https://files.example/upload-42?sig=2");
	});

	it("hands a model that cannot fetch a note instead of an address it would read as text", async () => {
		const model = new SeeingModel(false);
		const { runtime } = await startedWith(
			model,
			new SignedUrlAttachmentResolver(async () => "https://files.example/upload-42?sig=1"),
		);

		await runtime.runner.ask(askWith([RECEIPT]));

		expect(model.lastUserMessage?.hasMedia).toBe(false);
		expect(model.lastUserMessage?.text).toContain("what is this?");
		expect(model.lastUserMessage?.text).toContain("cannot fetch a remote file");
		expect(model.lastUserMessage?.text).not.toContain("sig=");
	});

	it("says a file is gone instead of saying nothing, and the conversation goes on", async () => {
		const model = new SeeingModel();
		const { runtime } = await startedWith(model, new InlineAttachmentResolver(async () => undefined));

		const result = await runtime.runner.ask(askWith([RECEIPT]));

		expect(result.text).toBe("answer 1");
		expect(model.lastUserMessage?.text).toContain("no longer available");
	});

	it("survives a resolver that throws, telling the model what stood there", async () => {
		const model = new SeeingModel();
		const failing = new (class extends AttachmentResolver {
			public async resolve(_context: SessionContext): Promise<AttachmentProjection> {
				throw new Error("the bucket is down");
			}
		})();
		const { runtime } = await startedWith(model, failing);

		const result = await runtime.runner.ask(askWith([RECEIPT]));

		expect(result.text).toBe("answer 1");
		expect(model.lastUserMessage?.text).toContain("could not be resolved");
	});

	it("projects a note naming the wiring gap when no resolver was declared", async () => {
		const model = new SeeingModel();
		const { runtime } = await startedWith(model, undefined);

		await runtime.runner.ask(askWith([RECEIPT]));

		expect(model.lastUserMessage?.hasMedia).toBe(false);
		expect(model.lastUserMessage?.text).toContain("no attachment resolver is configured");
	});

	it("lets the application drop an old image by position, keeping only the current turn's", async () => {
		const model = new SeeingModel();
		const recencyOnly = new (class extends AttachmentResolver {
			public async resolve(_context: SessionContext, request: AttachmentRequest): Promise<AttachmentProjection> {
				if (!request.isCurrentRun) return AttachmentProjection.noteFor(request.reference, "dropped by policy");
				return AttachmentProjection.media(MediaPart.image("image/png", PIXEL));
			}
		})();
		const { runtime } = await startedWith(model, recencyOnly);

		const first = await runtime.runner.ask(askWith([RECEIPT]));
		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("and now?", first.sessionId)));

		const shown = model.requests[1]?.messages.filter((message): message is UserMessage => message instanceof UserMessage);
		expect(shown?.[0]?.media ?? []).toHaveLength(0);
		expect(shown?.[0]?.text).toContain("dropped by policy");
	});

	it("still refuses a reference handed to an agent whose model cannot see", async () => {
		const blind = new (class extends LlmModel {
			public descriptor(): ModelDescriptor {
				return new ModelDescriptor(
					ModelIdentity.of("acme", "blind"),
					ModelContextWindow.of(100_000, 4000),
					ModelCapabilities.of([[ModelCapability.MEDIA_INPUT, false]]),
				);
			}

			public async *generate(): AsyncIterable<ModelChunk> {
				yield ModelChunk.text("never");
				yield ModelChunk.finish("stop");
			}
		})();
		const storage = new InMemorySessionStorage();
		const { runtime } = await startedWith(blind, undefined, storage);

		await expect(runtime.runner.ask(askWith([RECEIPT]))).rejects.toBeInstanceOf(UnsupportedCapabilityError);
		expect(await storage.find(SessionContext.fromSessionId(SessionId.from("id-1")))).toBeUndefined();
	});
});
