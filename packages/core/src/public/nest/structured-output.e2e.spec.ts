import "reflect-metadata";
import { Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { InvalidAgentMetadataError } from "../../adapters/nest/errors/invalid-agent-metadata.error";
import { UnsupportedCapabilityError } from "../../domain/model/errors/unsupported-capability.error";
import { LlmModel } from "../../domain/model/llm-model";
import { ModelCapabilities } from "../../domain/model/model-capabilities";
import { ModelCapability } from "../../domain/model/model-capability";
import { ModelChunk } from "../../domain/model/model-chunk";
import { ModelContextWindow } from "../../domain/model/model-context-window";
import { ModelDescriptor } from "../../domain/model/model-descriptor";
import { ModelIdentity } from "../../domain/model/model-identity";
import type { ModelRequest } from "../../domain/model/model-request";
import { ModelUsage } from "../../domain/model/model-usage";
import { FakeClock } from "../../support/fake-clock";
import { RecordingModel } from "../../support/nest/recording-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { AdkAgent } from "./adk-agent";
import { AdkModule } from "./adk-module";
import { AdkModuleOptions } from "./adk-module-options";
import { AgentRegistry } from "./agent-registry";
import { Agent } from "./decorators/agent.decorator";

const TITLE_SCHEMA = {
	type: "object",
	properties: { title: { type: "string" } },
	required: ["title"],
	additionalProperties: false,
};

@Agent({ name: "titler", description: "Names a thing.", outputSchema: TITLE_SCHEMA })
class TitlerAgent extends AdkAgent {}

@Agent({ name: "talker", description: "Answers in words." })
class TalkerAgent extends AdkAgent {}

/** Answers whatever it was told to, so a suite can hand a run a body to parse. */
class AnsweringModel extends LlmModel {
	public constructor(private readonly answer: string) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", "primary"),
			ModelContextWindow.of(100_000, 4_000),
			ModelCapabilities.of([[ModelCapability.STRUCTURED_OUTPUT, true]]),
		);
	}

	public async *generate(_request: ModelRequest): AsyncIterable<ModelChunk> {
		yield ModelChunk.text(this.answer);
		yield ModelChunk.usage(ModelUsage.of(20, 4));
		yield ModelChunk.finish("stop");
	}
}

/** A model that answers words and nothing else, which is most of them. */
class ProseOnlyModel extends AnsweringModel {
	public override descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", "prose"),
			ModelContextWindow.of(100_000, 4_000),
			ModelCapabilities.of([]),
		);
	}
}

describe("An agent that answers data", () => {
	let app: TestingModule;

	afterEach(async () => {
		await app?.close();
	});

	async function bootWith(model: LlmModel): Promise<TestingModule> {
		@Module({ providers: [TitlerAgent, TalkerAgent] })
		class FeatureModule {}

		app = await Test.createTestingModule({
			imports: [
				AdkModule.forRoot(new AdkModuleOptions(model, undefined, undefined, new FakeClock(), new SequenceIdGenerator())),
				FeatureModule,
			],
		}).compile();
		app.enableShutdownHooks();
		await app.init();

		return app;
	}

	it("asks the provider for the shape the agent declared", async () => {
		const model = new RecordingModel('{"title":"a name"}');
		const booted = await bootWith(model);

		await booted.get(AgentRegistry).get("titler").ask("name this");

		expect(model.requests.at(0)?.outputSchema).toBe(TITLE_SCHEMA);
	});

	it("asks for no shape on behalf of an agent that declared none, which is most of them", async () => {
		const model = new RecordingModel("a sentence");
		const booted = await bootWith(model);

		await booted.get(AgentRegistry).get("talker").ask("say something");

		expect(model.requests.at(0)?.wantsStructuredOutput).toBe(false);
	});

	it("answers with the parsed value beside the text, so nobody parses it twice", async () => {
		const booted = await bootWith(new AnsweringModel('{"title":"Migração do checkout"}'));

		const result = await booted.get(AgentRegistry).get("titler").ask("name this");

		expect(result.output).toEqual({ title: "Migração do checkout" });
		expect(result.text).toBe('{"title":"Migração do checkout"}');
	});

	it("leaves the output absent for an agent that answered prose", async () => {
		const booted = await bootWith(new RecordingModel("a sentence"));

		const result = await booted.get(AgentRegistry).get("talker").ask("say something");

		expect(result.output).toBeUndefined();
	});

	it("keeps asking for the shape on the turns that follow the first", async () => {
		const model = new RecordingModel('{"title":"a name"}');
		const booted = await bootWith(model);
		const titler = booted.get(AgentRegistry).get("titler");

		const first = await titler.ask("name this");
		await titler.ask("name it again", { sessionId: first.sessionId });

		expect(model.requests.at(1)?.outputSchema).toBe(TITLE_SCHEMA);
	});

	it("fails the run against a model that cannot answer data, rather than answering unchecked prose", async () => {
		const booted = await bootWith(new ProseOnlyModel("a sentence"));

		await expect(booted.get(AgentRegistry).get("titler").ask("name this")).rejects.toThrow(UnsupportedCapabilityError);
	});

	it("refuses to boot an agent whose declared shape is not an object", async () => {
		@Agent({ name: "broken", description: "...", outputSchema: "a schema" as unknown as object })
		class BrokenAgent extends AdkAgent {}

		@Module({ providers: [BrokenAgent] })
		class BrokenModule {}

		// The module is deliberately not kept: one that failed to init throws the same error again
		// when the teardown closes it, and the failure would be reported from there instead.
		await expect(
			Test.createTestingModule({
				imports: [AdkModule.forRoot(new AdkModuleOptions(new RecordingModel())), BrokenModule],
			})
				.compile()
				.then((module) => module.init()),
		).rejects.toThrow(InvalidAgentMetadataError);
	});
});
