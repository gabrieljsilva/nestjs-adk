import "reflect-metadata";
import { Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage.adapter";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage.adapter";
import { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import { CharacterCountOffloadPolicy } from "../../domain/artifact/character-count-offload.policy";
import { ModelCapabilities } from "../../domain/model/descriptor/model-capabilities.value-object";
import { ModelCapability } from "../../domain/model/descriptor/model-capability.value-object";
import { ModelContextWindow } from "../../domain/model/descriptor/model-context-window.value-object";
import { ModelDescriptor } from "../../domain/model/descriptor/model-descriptor.value-object";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import { LlmModel } from "../../domain/model/llm-model.contract";
import type { ModelRequest } from "../../domain/model/model-request.value-object";
import { ModelChunk } from "../../domain/model/streaming/model-chunk.value-object";
import { ModelUsage } from "../../domain/model/usage/model-usage.value-object";
import { ArtifactExplorationTools } from "../../runtime/artifact/artifact-explorer.service";
import { SearchArtifactTool } from "../../runtime/artifact/tools/search-artifact.tool";
import { RuntimeOptions } from "../../runtime/composition/runtime.options";
import { FakeClock } from "../../support/fake-clock.double";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { AdkAgent } from "./agent/adk-agent.edge";
import { Agent } from "./decorators/agent.decorator";
import { Tool } from "./decorators/tool.decorator";
import { AdkModuleOptions } from "./module/adk-module.options";
import { AdkModule } from "./module/adk.module";
import { AdkTool } from "./tool/adk.tool";

/** Records the tools it was declared, so what each agent may call is read off the wire. */
class RecordingModel extends LlmModel {
	public readonly declared: string[][] = [];

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			new ModelIdentity("acme", "primary"),
			new ModelContextWindow(100_000, 4_000),
			ModelCapabilities.fromEntries([[ModelCapability.TOOLS, true]]),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		this.declared.push(request.tools.map((tool) => tool.name));
		yield ModelChunk.text("done");
		yield ModelChunk.usage(ModelUsage.fromReport(10, 5));
		yield ModelChunk.finish("stop");
	}
}

const model = new RecordingModel();

@Tool({ name: "lookup_order", description: "Finds one order.", schema: z.object({ id: z.string() }) })
class LookupOrderTool extends AdkTool<z.ZodObject<{ id: z.ZodString }>> {
	public execute(): string {
		return "one order";
	}
}

@Agent({
	name: "reader",
	description: "Reads whatever it is handed.",
	prompt: "Be brief.",
	tools: [LookupOrderTool, ...ArtifactExplorationTools],
})
class ReaderAgent extends AdkAgent {}

@Agent({
	name: "searcher",
	description: "Only ever searches.",
	prompt: "Be brief.",
	tools: [LookupOrderTool, SearchArtifactTool],
})
class SearcherAgent extends AdkAgent {}

@Agent({ name: "teller", description: "Answers from what it knows.", prompt: "Be brief.", tools: [LookupOrderTool] })
class TellerAgent extends AdkAgent {}

@Module({
	imports: [
		AdkModule.forRoot(
			new AdkModuleOptions({
				defaultModel: model,
				storage: new InMemorySessionStorage(),
				artifacts: new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
				clock: new FakeClock(),
				ids: new SequenceIdGenerator("id"),
				runtime: RuntimeOptions.from({ context: { offload: CharacterCountOffloadPolicy.above(50) } }),
			}),
		),
	],
	providers: [LookupOrderTool, ReaderAgent, SearcherAgent, TellerAgent],
})
class StoreModule {}

/**
 * Which artifact tools an agent ends up with, through a booted module.
 *
 * It belongs in an e2e because the answer is assembled in three places that never meet in a
 * unit: `@Agent` names a class, the scanner turns it into a request, and the runtime binds that
 * request to the store it composed. A unit of any one of them would pass with the wiring cut.
 */
describe("the artifact tools an agent asked for", () => {
	let app: TestingModule | undefined;

	afterEach(async () => {
		await app?.close();
		app = undefined;
		model.declared.length = 0;
	});

	const boot = async (): Promise<TestingModule> => {
		app = await Test.createTestingModule({ imports: [StoreModule] }).compile();
		await app.init();
		return app;
	};

	it("gives an agent that asked for the group every one of them, beside its own tools", async () => {
		const booted = await boot();

		await booted.get(ReaderAgent).ask("hello");

		expect(model.declared[0]).toEqual([
			"lookup_order",
			"list_artifacts",
			"outline_artifact",
			"search_artifact",
			"query_artifact",
			"slice_artifact",
			"read_artifact",
		]);
	});

	it("gives an agent that asked for one tool that tool and not the other four", async () => {
		const booted = await boot();

		await booted.get(SearcherAgent).ask("hello");

		expect(model.declared[0]).toEqual(["lookup_order", "search_artifact", "read_artifact"]);
	});

	it("gives an agent that asked for none of them only the way back to an artifact it is shown", async () => {
		const booted = await boot();

		await booted.get(TellerAgent).ask("hello");

		expect(model.declared[0]).toEqual(["lookup_order", "read_artifact"]);
	});

	it("binds what it declared, so a tool an agent asked for actually answers", async () => {
		const booted = await boot();
		const handle = booted.get(ReaderAgent);
		const result = await handle.ask("hello");
		const stored = await handle.attachArtifact(
			result.sessionId.value,
			ArtifactContent.fromText("alpha\nbeta\ngamma\n", "text/plain"),
		);

		expect(stored.artifactId).toBeDefined();
	});
});
