import "reflect-metadata";
import { Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { InvalidAgentMetadataError } from "../../adapters/nest/errors/invalid-agent-metadata.error";
import { ModelCapabilities } from "../../domain/model/descriptor/model-capabilities.value-object";
import { ModelCapability } from "../../domain/model/descriptor/model-capability.value-object";
import { ModelContextWindow } from "../../domain/model/descriptor/model-context-window.value-object";
import { ModelDescriptor } from "../../domain/model/descriptor/model-descriptor.value-object";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import { UnsupportedCapabilityError } from "../../domain/model/errors/unsupported-capability.error";
import { LlmModel } from "../../domain/model/llm-model.contract";
import type { ModelRequest } from "../../domain/model/model-request.value-object";
import { ModelChunk } from "../../domain/model/streaming/model-chunk.value-object";
import { ModelUsage } from "../../domain/model/usage/model-usage.value-object";
import { FakeClock } from "../../support/fake-clock.double";
import { RecordingModel } from "../../support/nest/recording-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { AdkAgent } from "./agent/adk-agent.edge";
import { AgentRegistry } from "./agent/agent-registry.service";
import { Agent } from "./decorators/agent.decorator";
import { AdkModuleOptions } from "./module/adk-module.options";
import { AdkModule } from "./module/adk.module";

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
			new ModelIdentity("acme", "primary"),
			new ModelContextWindow(100_000, 4_000),
			ModelCapabilities.fromEntries([[ModelCapability.STRUCTURED_OUTPUT, true]]),
		);
	}

	public async *generate(_request: ModelRequest): AsyncIterable<ModelChunk> {
		yield ModelChunk.text(this.answer);
		yield ModelChunk.usage(ModelUsage.fromReport(20, 4));
		yield ModelChunk.finish("stop");
	}
}

/** A model that answers words and nothing else, which is most of them. */
class ProseOnlyModel extends AnsweringModel {
	public override descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			new ModelIdentity("acme", "prose"),
			new ModelContextWindow(100_000, 4_000),
			ModelCapabilities.fromEntries([]),
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
				AdkModule.forRoot(
					new AdkModuleOptions({
						defaultModel: model,
						clock: new FakeClock(),
						ids: new SequenceIdGenerator(),
					}),
				),
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

		await booted.get(AgentRegistry).open("titler").ask("name this");

		expect(model.requests.at(0)?.outputSchema).toBe(TITLE_SCHEMA);
	});

	it("asks for no shape on behalf of an agent that declared none, which is most of them", async () => {
		const model = new RecordingModel("a sentence");
		const booted = await bootWith(model);

		await booted.get(AgentRegistry).open("talker").ask("say something");

		expect(model.requests.at(0)?.wantsStructuredOutput).toBe(false);
	});

	it("answers with the parsed value beside the text, so nobody parses it twice", async () => {
		const booted = await bootWith(new AnsweringModel('{"title":"Migração do checkout"}'));

		const result = await booted.get(AgentRegistry).open("titler").ask("name this");

		expect(result.output).toEqual({ title: "Migração do checkout" });
		expect(result.text).toBe('{"title":"Migração do checkout"}');
	});

	it("leaves the output absent for an agent that answered prose", async () => {
		const booted = await bootWith(new RecordingModel("a sentence"));

		const result = await booted.get(AgentRegistry).open("talker").ask("say something");

		expect(result.output).toBeUndefined();
	});

	it("keeps asking for the shape on the turns that follow the first", async () => {
		const model = new RecordingModel('{"title":"a name"}');
		const booted = await bootWith(model);
		const titler = booted.get(AgentRegistry).open("titler");

		const first = await titler.ask("name this");
		await titler.ask("name it again", { sessionId: first.sessionId });

		expect(model.requests.at(1)?.outputSchema).toBe(TITLE_SCHEMA);
	});

	it("fails the run against a model that cannot answer data, rather than answering unchecked prose", async () => {
		const booted = await bootWith(new ProseOnlyModel("a sentence"));

		await expect(booted.get(AgentRegistry).open("titler").ask("name this")).rejects.toThrow(UnsupportedCapabilityError);
	});

	/**
	 * The module is deliberately not kept: one that failed to init throws the same error again
	 * when the teardown closes it, and the failure would be reported from there instead.
	 */
	it("refuses to boot an agent whose declared shape is not an object", async () => {
		@Agent({ name: "broken", description: "...", outputSchema: "a schema" as unknown as object })
		class BrokenAgent extends AdkAgent {}

		@Module({ providers: [BrokenAgent] })
		class BrokenModule {}

		await expect(
			Test.createTestingModule({
				imports: [
					AdkModule.forRoot(
						new AdkModuleOptions({
							defaultModel: new RecordingModel(),
						}),
					),
					BrokenModule,
				],
			})
				.compile()
				.then((module) => module.init()),
		).rejects.toThrow(InvalidAgentMetadataError);
	});
});
