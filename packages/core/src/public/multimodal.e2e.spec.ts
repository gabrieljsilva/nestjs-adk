import { afterEach, describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../adapters/storage/in-memory-artifact-storage";
import { InMemorySessionStorage } from "../adapters/storage/in-memory-session-storage";
import type { ArtifactId } from "../common/identity/artifact-id";
import { SessionId } from "../common/identity/session-id";
import { SessionRevision } from "../common/revision/session-revision";
import { AgentDefinition } from "../domain/agent/agent-definition";
import { AgentDescription } from "../domain/agent/agent-description";
import { AgentExecutionPolicies } from "../domain/agent/agent-execution-policies";
import { AgentName } from "../domain/agent/agent-name";
import { DeclaredAgent } from "../domain/agent/declared-agent";
import { SequentialFailoverPolicy } from "../domain/agent/sequential-failover-policy";
import { UserMessageReceived } from "../domain/event/catalog/user-message-received";
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
import { UnavailableFailure } from "../domain/model/unavailable-failure";
import { UserMessage } from "../domain/model/user-message";
import { PromptInstructions } from "../domain/prompt/prompt-instructions";
import { AskInput } from "../domain/session/ask-input";
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

function agentOf(model: LlmModel, policies: AgentExecutionPolicies = AgentExecutionPolicies.of()): DeclaredAgent {
	const definition = AgentDefinition.of(
		SUPPORT,
		AgentDescription.from("support agent", SUPPORT.value),
		model,
		PromptInstructions.from("Be brief."),
		policies,
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

async function base64Of(artifacts: InMemoryArtifactStorage, sessionId: SessionId, id: ArtifactId): Promise<string> {
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
		const runtime = await host.start(
			[agentOf(new FailingModel(), policies)],
			new InMemorySessionStorage(),
			new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
			new FakeClock(),
			new SequenceIdGenerator(),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.with("what is this?", [imageOf()])));

		expect(result.text).toBe("answer 1");
		expect(blind.lastUserMessage?.hasMedia).toBe(false);
		expect(blind.lastUserMessage?.text).toContain("cannot see images");
		expect(blind.lastUserMessage?.text).toContain("what is this?");
	});
});
