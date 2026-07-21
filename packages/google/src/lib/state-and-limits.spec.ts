import {
	AdkAgent,
	AdkModule,
	AdkTool,
	Agent,
	AgentMaxIterationsError,
	AgentStateInvalidError,
	ScriptedModel,
	Tool,
	ToolRepeatedFailureError,
	callTool,
	text,
} from "@nestjs-adk/core";
import type { ToolContext } from "@nestjs-adk/core";
import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import { GoogleAdkEngine } from "./google-adk-engine";

const emptySchema = z.object({});
const model = new ScriptedModel();

@Injectable()
class FlakyService {
	public calls = 0;
}

@Tool({ name: "flaky", description: "Always fails.", schema: emptySchema })
class FlakyTool extends AdkTool<typeof emptySchema> {
	constructor(private readonly service: FlakyService) {
		super();
	}

	execute() {
		this.service.calls += 1;
		throw new Error("boom");
	}
}

@Tool({ name: "read_tenant", description: "Reads the tenant from the state.", schema: emptySchema })
class ReadTenantTool extends AdkTool<typeof emptySchema> {
	execute(_input: z.infer<typeof emptySchema>, ctx?: ToolContext) {
		return { tenant: ctx?.state.require("tenantId") };
	}
}

@Agent({
	name: "guarded_native",
	model,
	description: "Guarded agent running on the native ADK loop.",
	prompt: "Guarded.",
	state: z.object({ tenantId: z.string().min(1) }),
	maxIterations: 2,
	maxConsecutiveToolFailures: 2,
	tools: [FlakyTool, ReadTenantTool],
})
class GuardedAgent extends AdkAgent {}

@Module({ providers: [FlakyService, FlakyTool, ReadTenantTool, GuardedAgent] })
class FeatureModule {}

describe("typed state + loop limits — the ADK's REAL loop with ScriptedModel", () => {
	let app: TestingModule;
	let guarded: GuardedAgent;

	beforeEach(async () => {
		model.scripts.length = 0;
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: GoogleAdkEngine, defaultModel: "gemini-2.5-flash" }), FeatureModule],
		}).compile();
		await app.init();
		guarded = app.get(GuardedAgent);
	});

	afterEach(async () => {
		await app.close();
	});

	it("valid state flows through the native loop and the tool reads it", async () => {
		model.enqueue([callTool("read_tenant", {}), text("done")]);

		const run = await guarded.ask({ message: "hi", state: { tenantId: "t1" } });

		const result = run.events.find((e) => e.type === "tool_result");
		expect(result && "result" in result ? result.result : null).toEqual({ tenant: "t1" });
	});

	it("invalid state fails closed before the native runtime is touched", async () => {
		// Empty script on purpose: if the model were called, ScriptedModel would throw "no script".
		const error = await guarded.ask({ message: "hi", state: { tenantId: 42 } }).catch((e) => e);

		expect(error).toBeInstanceOf(AgentStateInvalidError);
		expect((error as AgentStateInvalidError).key).toBe("tenantId");
	});

	it("maxIterations aborts the native loop", async () => {
		model.enqueue([callTool("read_tenant", {}), callTool("read_tenant", {}), callTool("read_tenant", {}), text("never")]);

		const error = await guarded.ask({ message: "hi", state: { tenantId: "t1" } }).catch((e) => e);

		expect(error).toBeInstanceOf(AgentMaxIterationsError);
		expect((error as AgentMaxIterationsError).limit).toBe(2);
		// Tool-call-only turns must contribute usage (llm_response without text) — the loop's real cost.
		expect((error as AgentMaxIterationsError).usage.totalTokens).toBeGreaterThan(0);
		expect((error as AgentMaxIterationsError).lastTool).toBe("read_tenant");
	});

	it("breaker: native loop feeds tool errors back to the model — 2nd consecutive failure aborts", async () => {
		// The model insists on the failing tool; without the breaker it would burn the whole script.
		model.enqueue([callTool("flaky", {}), callTool("flaky", {}), callTool("flaky", {}), text("never")]);

		const error = await guarded.ask({ message: "hi", state: { tenantId: "t1" } }).catch((e) => e);

		expect(error).toBeInstanceOf(ToolRepeatedFailureError);
		expect((error as ToolRepeatedFailureError).failures).toBe(2);
		expect(app.get(FlakyService).calls).toBe(2);
	});
});
