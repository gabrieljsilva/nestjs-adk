import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkEngine } from "../abstracts/adk-engine";
import { AdkTool } from "../abstracts/adk-tool";
import { SessionStore } from "../abstracts/session-store";
import { Agent } from "../decorators/agent.decorator";
import { Tool } from "../decorators/tool.decorator";
import {
	AgentMaxIterationsError,
	AgentStateInvalidError,
	AgentStateMissingError,
	ToolExecutionError,
	ToolRepeatedFailureError,
} from "../errors";
import { AdkModule } from "../module/adk.module";
import { ScriptedEngine, callTool, text } from "../testing/scripted-engine";
import type { ToolContext } from "../types/tool-context";
import { AgentRunner } from "./agent-runner";

const emptySchema = z.object({});

@Tool({ name: "read_tenant", description: "Reads the required tenantId from the state.", schema: emptySchema })
class ReadTenantTool extends AdkTool<typeof emptySchema> {
	execute(_input: z.infer<typeof emptySchema>, ctx?: ToolContext) {
		return { tenant: ctx?.state.require("tenantId") };
	}
}

@Tool({ name: "write_count", description: "Writes an invalid value into a declared key.", schema: emptySchema })
class WriteCountTool extends AdkTool<typeof emptySchema> {
	execute(_input: z.infer<typeof emptySchema>, ctx?: ToolContext) {
		ctx?.state.set("count", "not-a-number");
		return { ok: true };
	}
}

@Injectable()
class FlakyService {
	public fails = true;
}

@Tool({ name: "flaky", description: "Fails on demand.", schema: emptySchema })
class FlakyTool extends AdkTool<typeof emptySchema> {
	constructor(private readonly service: FlakyService) {
		super();
	}

	execute() {
		if (this.service.fails) throw new Error("boom");
		return { ok: true };
	}
}

const guardedState = z.object({ tenantId: z.string().min(1), count: z.number() });

@Agent({
	name: "guarded",
	description: "Agent with state schema and loop limits.",
	prompt: "Guarded.",
	model: "scripted",
	state: guardedState,
	maxIterations: 2,
	maxConsecutiveToolFailures: 2,
	tools: [ReadTenantTool, WriteCountTool, FlakyTool],
})
class GuardedAgent extends AdkAgent {}

@Tool({ name: "echo", description: "Echoes.", schema: emptySchema })
class EchoTool extends AdkTool<typeof emptySchema> {
	execute() {
		return { ok: true };
	}
}

@Agent({
	name: "free",
	description: "Agent without schema or limits.",
	prompt: "Free.",
	model: "scripted",
	tools: [EchoTool],
})
class FreeAgent extends AdkAgent {}

@Module({
	providers: [FlakyService, ReadTenantTool, WriteCountTool, FlakyTool, EchoTool, GuardedAgent, FreeAgent],
})
class FeatureModule {}

describe("typed state + loop limits (ScriptedEngine)", () => {
	let app: TestingModule;
	let engine: ScriptedEngine;
	let guarded: GuardedAgent;
	let free: FreeAgent;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [
				// defaults.maxIterations = 1 on purpose: GuardedAgent's own 2 must win (agent > forRoot defaults).
				AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "scripted", defaults: { maxIterations: 1 } }),
				FeatureModule,
			],
		}).compile();
		await app.init();
		engine = app.get(AdkEngine) as ScriptedEngine;
		guarded = app.get(GuardedAgent);
		free = app.get(FreeAgent);
	});

	afterEach(async () => {
		await app.close();
	});

	describe("state schema", () => {
		it("valid state → run completes and the tool reads the typed value", async () => {
			engine.enqueue([callTool("read_tenant", {}), text("done")]);

			const run = await guarded.ask({ message: "hi", state: { tenantId: "t1" } });

			const result = run.events.find((e) => e.type === "tool_result");
			expect(result && "result" in result ? result.result : null).toEqual({ tenant: "t1" });
		});

		it("invalid state at entry → AgentStateInvalidError before any engine call", async () => {
			const spy = vi.spyOn(engine, "run");

			const error = await guarded.ask({ message: "hi", state: { tenantId: { $gt: "" } } }).catch((e) => e);

			expect(error).toBeInstanceOf(AgentStateInvalidError);
			expect(error.key).toBe("tenantId");
			expect(spy).not.toHaveBeenCalled();
		});

		it("hydrated session with invalid state → fails closed before the model", async () => {
			await app.get(SessionStore).create({ id: "bad-session", state: { tenantId: 42 } });
			const spy = vi.spyOn(engine, "run");

			const error = await guarded.ask({ sessionId: "bad-session", message: "hi" }).catch((e) => e);

			expect(error).toBeInstanceOf(AgentStateInvalidError);
			expect(spy).not.toHaveBeenCalled();
		});

		it("tool writing an invalid value into a declared key → throws at the write", async () => {
			engine.enqueue([callTool("write_count", {})]);

			const error = await guarded.ask({ message: "hi", state: { tenantId: "t1" } }).catch((e) => e);

			expect(error).toBeInstanceOf(ToolExecutionError);
			expect(error.cause).toBeInstanceOf(AgentStateInvalidError);
			expect(error.cause.key).toBe("count");
		});

		it("undeclared keys pass freely at entry and on writes", async () => {
			engine.enqueue([text("ok")]);

			const run = await guarded.ask({ message: "hi", state: { tenantId: "t1", extraneous: { any: "shape" } } });

			expect(run.status).toBe("completed");
		});

		it("require() on a missing key → AgentStateMissingError instead of undefined", async () => {
			engine.enqueue([callTool("read_tenant", {})]);

			const error = await guarded.ask({ message: "hi" }).catch((e) => e);

			expect(error).toBeInstanceOf(ToolExecutionError);
			expect(error.cause).toBeInstanceOf(AgentStateMissingError);
			expect(error.cause.key).toBe("tenantId");
		});

		it("agent without a schema is untouched by any state shape", async () => {
			engine.enqueue([text("ok")]);

			const run = await free.ask({ message: "hi", state: { anything: { deeply: ["weird"] } } });

			expect(run.status).toBe("completed");
		});
	});

	describe("loop limits", () => {
		it("run under maxIterations is unaffected (and agent limit beats forRoot defaults)", async () => {
			engine.enqueue([callTool("echo", {}), callTool("echo", {}), text("done")]);
			// FreeAgent has no own limit → would trip the defaults' 1; GuardedAgent's 2 allows both calls.
			engine.enqueue([callTool("read_tenant", {}), callTool("read_tenant", {}), text("done")]);

			const error = await free.ask({ message: "hi" }).catch((e) => e);
			const run = await guarded.ask({ message: "hi", state: { tenantId: "t1" } });

			expect(error).toBeInstanceOf(AgentMaxIterationsError);
			expect(run.status).toBe("completed");
		});

		it("exceeding maxIterations → AgentMaxIterationsError with agent name and limit", async () => {
			engine.enqueue([
				callTool("read_tenant", {}),
				callTool("read_tenant", {}),
				callTool("read_tenant", {}),
				text("never"),
			]);

			const error = await guarded.ask({ message: "hi", state: { tenantId: "t1" } }).catch((e) => e);

			expect(error).toBeInstanceOf(AgentMaxIterationsError);
			expect(error.limit).toBe(2);
			expect(error.message).toContain("guarded");
			expect(error.usage).toBeDefined();
		});

		it("ask() override wins over the decorator limit", async () => {
			engine.enqueue([callTool("read_tenant", {}), callTool("read_tenant", {}), text("done")]);

			const error = await guarded.ask({ message: "hi", state: { tenantId: "t1" }, maxIterations: 1 }).catch((e) => e);

			expect(error).toBeInstanceOf(AgentMaxIterationsError);
			expect(error.limit).toBe(1);
		});

		it("breaker: same tool failing N consecutive times → ToolRepeatedFailureError", async () => {
			const runner = app.get(AgentRunner);
			const resolved = await runner.resolve(GuardedAgent, { message: "" });
			const flaky = resolved.tools.find((tool) => tool.name === "flaky");

			await expect(flaky?.execute({})).rejects.toBeInstanceOf(ToolExecutionError);
			const error = (await flaky?.execute({}).catch((e) => e)) as ToolRepeatedFailureError;

			expect(error).toBeInstanceOf(ToolRepeatedFailureError);
			expect(error.tool).toBe("flaky");
			expect(error.failures).toBe(2);
		});

		it("breaker: a success resets the consecutive-failure count", async () => {
			const runner = app.get(AgentRunner);
			const service = app.get(FlakyService);
			const resolved = await runner.resolve(GuardedAgent, { message: "" });
			const flaky = resolved.tools.find((tool) => tool.name === "flaky");

			await expect(flaky?.execute({})).rejects.toBeInstanceOf(ToolExecutionError);
			service.fails = false;
			await expect(flaky?.execute({})).resolves.toEqual({ ok: true });
			service.fails = true;

			// Without the reset this second failure would be the 2nd consecutive → breaker would trip.
			await expect(flaky?.execute({})).rejects.toBeInstanceOf(ToolExecutionError);
		});

		it("consumer abort signal propagates to the engine through the combined signal", async () => {
			engine.enqueue([text("ok")]);
			const consumer = new AbortController();
			consumer.abort();

			await free.ask({ message: "hi", signal: consumer.signal }).catch(() => undefined);

			expect(engine.lastInput?.signal?.aborted).toBe(true);
		});

		it("nothing configured at any level → no cap", async () => {
			const noDefaults = await Test.createTestingModule({
				imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "scripted" }), FeatureModule],
			}).compile();
			await noDefaults.init();

			const localEngine = noDefaults.get(AdkEngine) as ScriptedEngine;
			const turns = Array.from({ length: 10 }, () => callTool("echo", {}));
			localEngine.enqueue([...turns, text("done")]);

			const run = await noDefaults.get(FreeAgent).ask({ message: "hi" });
			expect(run.status).toBe("completed");

			await noDefaults.close();
		});
	});
});
