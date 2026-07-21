import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { Agent } from "../decorators/agent.decorator";
import { WorkflowAgent } from "../decorators/workflow-agent.decorator";
import { AdkModule } from "../module/adk.module";
import { ScriptedEngine, text } from "../testing/scripted-engine";
import { AdkAgent } from "./adk-agent";
import { AdkEngine } from "./adk-engine";
import { AdkWorkflow } from "./adk-workflow";

@Agent({ name: "extract", description: "Extracts data.", prompt: "Extract." })
class ExtractAgent extends AdkAgent {}

@Agent({ name: "summarize", description: "Summarizes.", prompt: "Summarize." })
class SummarizeAgent extends AdkAgent {}

@WorkflowAgent({ name: "etl", mode: "sequential", agents: [ExtractAgent, SummarizeAgent] })
class EtlWorkflow extends AdkWorkflow {}

@Injectable()
class ReportService {
	constructor(public readonly etl: EtlWorkflow) {}
}

@Module({ providers: [ExtractAgent, SummarizeAgent, EtlWorkflow, ReportService] })
class FeatureModule {}

describe("AdkWorkflow — the instance is the execution handle", () => {
	let app: TestingModule;
	let engine: ScriptedEngine;
	let service: ReportService;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "test-model" }), FeatureModule],
		}).compile();
		await app.init();
		engine = app.get(AdkEngine) as ScriptedEngine;
		service = app.get(ReportService);
	});

	afterEach(async () => {
		await app.close();
	});

	it("ask(): runs the workflow via plain DI and aggregates the result", async () => {
		engine.enqueue([text("pipeline done")]);

		const run = await service.etl.ask({ message: "run the etl" });

		expect(run.text).toBe("pipeline done");
		expect(engine.lastAgent?.name).toBe("etl");
		expect(engine.lastAgent?.workflow?.mode).toBe("sequential");
		expect(engine.lastAgent?.workflow?.agents.map((a) => a.name)).toEqual(["extract", "summarize"]);
	});

	it("stream(): yields the normalized event loop", async () => {
		engine.enqueue([text("streamed")]);

		const types: string[] = [];
		for await (const event of service.etl.stream({ message: "go" })) types.push(event.type);

		expect(types[0]).toBe("run_start");
		expect(types).toContain("llm_response");
		expect(types.at(-1)).toBe("final");
	});
});
