import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodToolSchema } from "../adapters/schema/zod-tool-schema";
import { InMemoryArtifactStorage } from "../adapters/storage/in-memory-artifact-storage";
import { InMemorySessionStorage } from "../adapters/storage/in-memory-session-storage";
import { SessionId } from "../common/identity/session-id";
import { SessionRevision } from "../common/revision/session-revision";
import { ArtifactStorage } from "../contracts/artifact-storage";
import { AgentDefinition } from "../domain/agent/agent-definition";
import { AgentDescription } from "../domain/agent/agent-description";
import { AgentExecutionPolicies } from "../domain/agent/agent-execution-policies";
import { AgentName } from "../domain/agent/agent-name";
import { DeclaredAgent } from "../domain/agent/declared-agent";
import { SequentialFailoverPolicy } from "../domain/agent/sequential-failover-policy";
import type { ArtifactContent } from "../domain/artifact/artifact-content";
import type { ArtifactReference } from "../domain/artifact/artifact-reference";
import { ToolResultProduced } from "../domain/event/catalog/tool-result-produced";
import { UserMessageReceived } from "../domain/event/catalog/user-message-received";
import type { AttachmentReference } from "../domain/model/attachment-reference";
import { ModelCallFailedError } from "../domain/model/errors/model-call-failed.error";
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
import { ToolCallDelta } from "../domain/model/tool-call-delta";
import { ToolResultMessage } from "../domain/model/tool-result-message";
import { UnavailableFailure } from "../domain/model/unavailable-failure";
import { UserMessage } from "../domain/model/user-message";
import { PromptInstructions } from "../domain/prompt/prompt-instructions";
import { AskInput } from "../domain/session/ask-input";
import { ToolDefinition } from "../domain/tool/tool-definition";
import { ToolEffect } from "../domain/tool/tool-effect";
import { ToolHandler } from "../domain/tool/tool-handler";
import { ToolOutput } from "../domain/tool/tool-output";
import { AttachmentNotStoredError } from "../runtime/artifact/errors/attachment-not-stored.error";
import { AgentRunCommand } from "../runtime/run/agent-run-command";
import { FakeClock } from "../support/fake-clock";
import { SequenceIdGenerator } from "../support/sequence-id-generator";
import { AdkRuntimeHost } from "./adk-runtime-host";

const SUPPORT = AgentName.from("support");
const PIXEL = "iVBORw0KGgo=";

/** Records every request, so a test can assert what the model was actually shown. */
class SeeingModel extends LlmModel {
	public readonly requests: ModelRequest[] = [];

	public constructor(
		private readonly name: string = "seeing",
		private readonly seesImages: boolean = true,
	) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", this.name),
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.of([[ModelCapability.MEDIA_INPUT, this.seesImages]]),
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

/** Fails every call, so the run has to reroute to the next model in the chain. */
class FailingModel extends LlmModel {
	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", "failing"),
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.of([[ModelCapability.MEDIA_INPUT, true]]),
		);
	}

	public async *generate(): AsyncIterable<ModelChunk> {
		// The chunk never arrives: the failure has to reach the runner before anything is emitted,
		// which is the only point where a reroute is still allowed.
		yield await Promise.reject(new ModelCallFailedError(new UnavailableFailure("the provider is down"), "acme/failing"));
	}
}

/** Asks for the chart on the first turn and comments on it once it has seen it. */
class ChartingModel extends LlmModel {
	public readonly requests: ModelRequest[] = [];

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", "charting"),
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.of([
				[ModelCapability.TOOLS, true],
				[ModelCapability.MEDIA_INPUT, true],
			]),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		this.requests.push(request);
		if (request.messages.some((message) => message instanceof ToolResultMessage)) {
			yield ModelChunk.text("sales are up");
			yield ModelChunk.finish("stop");
			return;
		}
		yield ModelChunk.toolCall(new ToolCallDelta(0, JSON.stringify({ metric: "sales" }), "c-1", "render_chart"));
		yield ModelChunk.finish("tool_calls");
	}
}

/** Answers data and the picture of it, which is what `ToolOutput` exists for. */
class ChartHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return ToolOutput.with({ rendered: true }, [imageOf()]);
	}
}

function chartTool(): ToolDefinition {
	return new ToolDefinition(
		"render_chart",
		"Draws a chart of a metric",
		ZodToolSchema.of(z.object({ metric: z.string() })),
		ToolEffect.READ,
		new ChartHandler(),
	);
}

function agentOf(
	model: LlmModel,
	policies: AgentExecutionPolicies = AgentExecutionPolicies.of(),
	tools: readonly ToolDefinition[] = [],
): DeclaredAgent {
	const definition = AgentDefinition.of(
		SUPPORT,
		AgentDescription.from("support agent", SUPPORT.value),
		model,
		PromptInstructions.from("Be brief."),
		policies,
		tools,
	);
	return new DeclaredAgent(definition, "SupportAgent");
}

function imageOf(): MediaPart {
	return MediaPart.image("image/png", PIXEL);
}

async function messagesOf(storage: InMemorySessionStorage, sessionId: SessionId): Promise<UserMessageReceived[]> {
	const found: UserMessageReceived[] = [];
	for await (const stored of storage.readEvents(sessionId, SessionRevision.initial())) {
		if (stored.event instanceof UserMessageReceived) found.push(stored.event);
	}
	return found;
}

/** Refuses every write, which is a bucket that is unreachable rather than one that is full. */
class RefusingArtifactStorage extends ArtifactStorage {
	public async put(): Promise<ArtifactReference> {
		throw new Error("the bucket is unreachable");
	}

	public async read(): Promise<ArtifactContent> {
		throw new Error("the bucket is unreachable");
	}

	public async find(): Promise<ArtifactReference | undefined> {
		return undefined;
	}

	public async deleteAll(): Promise<void> {
		return undefined;
	}
}

async function eventCountOf(storage: InMemorySessionStorage, sessionId: SessionId): Promise<number> {
	let count = 0;
	for await (const _stored of storage.readEvents(sessionId, SessionRevision.initial())) count += 1;
	return count;
}

async function resultsOf(storage: InMemorySessionStorage, sessionId: SessionId): Promise<ToolResultProduced[]> {
	const found: ToolResultProduced[] = [];
	for await (const stored of storage.readEvents(sessionId, SessionRevision.initial())) {
		if (stored.event instanceof ToolResultProduced) found.push(stored.event);
	}
	return found;
}

async function base64Of(
	artifacts: InMemoryArtifactStorage,
	sessionId: SessionId,
	attachment: AttachmentReference,
): Promise<string> {
	const id = attachment.artifactId;
	if (id === undefined) throw new Error("expected the attachment to be a stored one");
	const reference = await artifacts.find(sessionId, id);
	if (reference === undefined) throw new Error("expected the attachment to have been stored");
	return (await artifacts.read(sessionId, reference)).text;
}

const host = new AdkRuntimeHost();

afterEach(async () => {
	await host.stop();
});

describe("a question with an image in it", () => {
	it("shows the image to the model and keeps only its id in the journal", async () => {
		const model = new SeeingModel();
		const storage = new InMemorySessionStorage();
		const artifacts = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
		const runtime = await host.start([agentOf(model)], storage, artifacts, new FakeClock(), new SequenceIdGenerator());

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.with("what is this?", [imageOf()])));

		expect(model.lastUserMessage?.hasMedia).toBe(true);
		expect(model.lastUserMessage?.media[0]?.base64).toBe(PIXEL);

		const [message] = await messagesOf(storage, result.sessionId);
		expect(message?.attachments).toHaveLength(1);
		expect(JSON.stringify(message)).not.toContain(PIXEL);
	});

	it("writes the bytes once, where bytes belong", async () => {
		const storage = new InMemorySessionStorage();
		const artifacts = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
		const runtime = await host.start(
			[agentOf(new SeeingModel())],
			storage,
			artifacts,
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.with("look", [imageOf()])));
		const [message] = await messagesOf(storage, result.sessionId);
		const id = message?.attachments[0];
		if (id === undefined) throw new Error("expected an attachment id");

		expect(await base64Of(artifacts, result.sessionId, id)).toBe(PIXEL);
	});

	it("still shows the image two turns later, because history brings it back", async () => {
		const model = new SeeingModel();
		const runtime = await host.start(
			[agentOf(model)],
			new InMemorySessionStorage(),
			new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const first = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.with("what is this?", [imageOf()])));
		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("and its colour?", first.sessionId)));
		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("are you sure?", first.sessionId)));

		const shown = model.requests[2]?.messages.filter((message): message is UserMessage => message instanceof UserMessage);
		expect(shown?.[0]?.media[0]?.base64).toBe(PIXEL);
		expect(model.requests[2]?.hasMedia).toBe(true);
	});

	it("refuses the question when the agent's model cannot see, before anything is recorded", async () => {
		const blind = new SeeingModel("blind", false);
		const storage = new InMemorySessionStorage();
		const ids = new SequenceIdGenerator();
		const runtime = await host.start(
			[agentOf(blind)],
			storage,
			new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
			new FakeClock(),
			ids,
		);

		await expect(
			runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.with("what is this?", [imageOf()]))),
		).rejects.toBeInstanceOf(UnsupportedCapabilityError);

		expect(blind.requests).toHaveLength(0);
		expect(await storage.find(SessionId.from("id-1"))).toBeUndefined();
	});

	it("degrades to a note when a reroute lands on a model that cannot see", async () => {
		const blind = new SeeingModel("blind", false);
		const policies = AgentExecutionPolicies.of(new SequentialFailoverPolicy([blind]));
		const storage = new InMemorySessionStorage();
		const artifacts = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
		const runtime = await host.start(
			[agentOf(new FailingModel(), policies)],
			storage,
			artifacts,
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.with("what is this?", [imageOf()])));

		expect(result.text).toBe("answer 1");
		expect(blind.lastUserMessage?.hasMedia).toBe(false);
		expect(blind.lastUserMessage?.text).toContain("cannot see images");
		expect(blind.lastUserMessage?.text).toContain("what is this?");

		// The session was not rewritten, so a model that can see would be shown the image again.
		const [message] = await messagesOf(storage, result.sessionId);
		const id = message?.attachments[0];
		if (id === undefined) throw new Error("expected the attachment to still be recorded");
		expect(await base64Of(artifacts, result.sessionId, id)).toBe(PIXEL);
	});

	it("refuses the question when the attachment cannot be written anywhere", async () => {
		const storage = new InMemorySessionStorage();
		const runtime = await host.start(
			[agentOf(new SeeingModel())],
			storage,
			new RefusingArtifactStorage(),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		await expect(
			runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.with("what is this?", [imageOf()]))),
		).rejects.toBeInstanceOf(AttachmentNotStoredError);

		expect(await eventCountOf(storage, SessionId.from("id-1"))).toBe(0);
	});
});

describe("a tool that answers with an image", () => {
	it("shows the model the data and the picture, in that order", async () => {
		const model = new ChartingModel();
		const runtime = await host.start(
			[agentOf(model, AgentExecutionPolicies.of(), [chartTool()])],
			new InMemorySessionStorage(),
			new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("chart my sales")));

		const messages = model.requests[1]?.messages ?? [];
		const at = messages.findIndex((message) => message instanceof ToolResultMessage);
		const result = messages[at];
		const carrier = messages[at + 1];

		expect(result instanceof ToolResultMessage ? result.hasMedia : true).toBe(false);
		expect(result?.text).toContain("render_chart");
		// The base64 must not have been stringified into the result the model reads.
		expect(result?.text).not.toContain(PIXEL);
		expect(carrier instanceof UserMessage && carrier.media[0]?.base64).toBe(PIXEL);
	});

	it("records the id of what it drew, and never the drawing", async () => {
		const storage = new InMemorySessionStorage();
		const artifacts = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
		const runtime = await host.start(
			[agentOf(new ChartingModel(), AgentExecutionPolicies.of(), [chartTool()])],
			storage,
			artifacts,
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const answer = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("chart my sales")));
		const [produced] = await resultsOf(storage, answer.sessionId);
		const id = produced?.attachments[0];
		if (id === undefined) throw new Error("expected the tool result to name an attachment");

		expect(JSON.stringify(produced?.output)).not.toContain(PIXEL);
		expect(await base64Of(artifacts, answer.sessionId, id)).toBe(PIXEL);
	});
});
