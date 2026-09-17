import { afterEach, describe, expect, it } from "vitest";
import { InlineAttachmentResolver } from "../adapters/attachment/inline-attachment-resolver.adapter";
import { SignedUrlAttachmentResolver } from "../adapters/attachment/signed-url-attachment-resolver.adapter";
import { InMemoryArtifactStorage } from "../adapters/storage/in-memory-artifact-storage.adapter";
import { InMemorySessionStorage } from "../adapters/storage/in-memory-session-storage.adapter";
import { SessionId } from "../common/identity/session-id.value-object";
import { SessionRevision } from "../common/revision/session-revision.value-object";
import { AttachmentResolver } from "../contracts/context/attachment-resolver.contract";
import { AgentDefinition } from "../domain/agent/agent-definition.value-object";
import { AgentDescription } from "../domain/agent/agent-description.value-object";
import { AgentExecutionPolicies } from "../domain/agent/agent-execution-policies.value-object";
import { AgentName } from "../domain/agent/agent-name.value-object";
import { DeclaredAgent } from "../domain/agent/declared-agent.value-object";
import { UserMessageReceived } from "../domain/event/catalog/session/user-message-received.event";
import { AttachmentProjection } from "../domain/model/attachment/attachment-projection.value-object";
import { AttachmentReference } from "../domain/model/attachment/attachment-reference.value-object";
import type { AttachmentRequest } from "../domain/model/attachment/attachment-request.value-object";
import { ModelCapabilities } from "../domain/model/descriptor/model-capabilities.value-object";
import { ModelCapability } from "../domain/model/descriptor/model-capability.value-object";
import { ModelContextWindow } from "../domain/model/descriptor/model-context-window.value-object";
import { ModelDescriptor } from "../domain/model/descriptor/model-descriptor.value-object";
import { ModelIdentity } from "../domain/model/descriptor/model-identity.value-object";
import { UnsupportedCapabilityError } from "../domain/model/errors/unsupported-capability.error";
import { LlmModel } from "../domain/model/llm-model.contract";
import { MediaPart } from "../domain/model/messages/media-part.value-object";
import { UserMessage } from "../domain/model/messages/user-message.value-object";
import { ModelRequest } from "../domain/model/model-request.value-object";
import { ModelChunk } from "../domain/model/streaming/model-chunk.value-object";
import { PromptInstructions } from "../domain/prompt/prompt-instructions.value-object";
import { SessionContext } from "../domain/run/session-context.value-object";
import { AskInput } from "../domain/session/input/ask-input.command";
import { RuntimeOptions } from "../runtime/composition/runtime.options";
import { AgentRunCommand } from "../runtime/run/agent-run.command";
import { FakeClock } from "../support/fake-clock.double";
import { SequenceIdGenerator } from "../support/sequence-id-generator.double";
import { AdkRuntime } from "./adk-runtime.edge";

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
			new ModelIdentity("acme", this.fetchesUrls ? "fetching" : "seeing"),
			new ModelContextWindow(100_000, 4000),
			ModelCapabilities.fromEntries([
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
	const definition = new AgentDefinition(
		SUPPORT,
		AgentDescription.from("support agent", SUPPORT.value),
		model,
		PromptInstructions.from("Be brief."),
		new AgentExecutionPolicies(),
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

const host = new AdkRuntime();

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
		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.fromMessage("and now?", first.sessionId)));

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
				if (!request.isCurrentRun) return AttachmentProjection.fromReference(request.reference, "dropped by policy");
				return AttachmentProjection.media(MediaPart.image("image/png", PIXEL));
			}
		})();
		const { runtime } = await startedWith(model, recencyOnly);

		const first = await runtime.runner.ask(askWith([RECEIPT]));
		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.fromMessage("and now?", first.sessionId)));

		const shown = model.requests[1]?.messages.filter((message): message is UserMessage => message instanceof UserMessage);
		expect(shown?.[0]?.media ?? []).toHaveLength(0);
		expect(shown?.[0]?.text).toContain("dropped by policy");
	});

	it("still refuses a reference handed to an agent whose model cannot see", async () => {
		const blind = new (class extends LlmModel {
			public descriptor(): ModelDescriptor {
				return new ModelDescriptor(
					new ModelIdentity("acme", "blind"),
					new ModelContextWindow(100_000, 4000),
					ModelCapabilities.fromEntries([[ModelCapability.MEDIA_INPUT, false]]),
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
