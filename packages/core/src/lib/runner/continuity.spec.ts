import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkEngine } from "../abstracts/adk-engine";
import { ArtifactStore } from "../abstracts/artifact-store";
import { SessionStore } from "../abstracts/session-store";
import { Agent } from "../decorators/agent.decorator";
import { Tool } from "../decorators/tool.decorator";
import { contextPolicy } from "../models/context-policy";
import { AdkModule } from "../module/adk.module";
import { AgentRegistry } from "../registry/agent-registry";
import { ScriptedEngine, callTool, text } from "../testing/scripted-engine";

@Injectable()
class PrefsService {
	public requireConfirmation = false;
}

@Injectable()
class PaymentService {
	public transfer = vi.fn().mockReturnValue({ receipt: "rc-1" });
}

const bigSchema = z.object({ q: z.string() });
const BIG_PAYLOAD = "x".repeat(30_000);

@Agent({ name: "data_agent", model: "m", description: "d" })
class DataAgent extends AdkAgent {
	@Tool({ description: "Returns a huge JSON.", schema: bigSchema })
	fetchBig() {
		return { rows: BIG_PAYLOAD };
	}

	@Tool({ description: "Returns a huge JSON without offload.", schema: bigSchema, offload: false })
	fetchBigRaw() {
		return { rows: BIG_PAYLOAD };
	}
}

@Agent({ name: "tuned_agent", model: "m", description: "d", context: contextPolicy({ offload: { threshold: 100 } }) })
class TunedAgent extends AdkAgent {
	@Tool({ description: "Small payload that busts a custom threshold.", schema: bigSchema })
	fetchSmall() {
		return { rows: "y".repeat(200) };
	}
}

const transferSchema = z.object({ amount: z.number(), to: z.string() });

@Agent({ name: "banker", model: "m", description: "d" })
class BankerAgent extends AdkAgent {
	constructor(
		private readonly payments: PaymentService,
		private readonly prefs: PrefsService,
	) {
		super();
	}

	@Tool({ description: "Transfers money.", schema: transferSchema, requiresApproval: true })
	transfer(input: z.infer<typeof transferSchema>) {
		return this.payments.transfer(input.amount, input.to);
	}

	@Tool({
		description: "Transfers with conditional approval based on user preference.",
		schema: transferSchema,
		requiresApproval(this: BankerAgent) {
			return this.prefs.requireConfirmation;
		},
	})
	transferConditional(input: z.infer<typeof transferSchema>) {
		return this.payments.transfer(input.amount, input.to);
	}
}

@Module({ providers: [PrefsService, PaymentService, DataAgent, TunedAgent, BankerAgent] })
class FeatureModule {}

describe("F7 — Continuity (offload + HITL)", () => {
	let app: TestingModule;
	let engine: ScriptedEngine;
	let registry: AgentRegistry;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "m" }), FeatureModule],
		}).compile();
		await app.init();
		engine = app.get(AdkEngine) as ScriptedEngine;
		registry = app.get(AgentRegistry);
	});

	afterEach(async () => {
		await app.close();
	});

	describe("automatic offload of tool results", () => {
		it("payload above the threshold becomes a digest + artifact; read_artifact retrieves the content", async () => {
			engine.enqueue([callTool("fetchBig", { q: "a" }), text("summarized")]);
			const run = await registry.getRef(DataAgent).ask({ sessionId: "s1", message: "data" });

			const result = run.events.find((e) => e.type === "tool_result" && e.tool === "fetchBig");
			const digest = result && "result" in result ? (result.result as Record<string, unknown>) : null;
			expect(digest?.__artifact).toBeDefined();
			const ref = digest?.__artifact as { name: string; bytes: number };
			expect(ref.bytes).toBeGreaterThan(20_000);

			// artifact persisted in the store
			const artifacts = app.get(ArtifactStore);
			const saved = await artifacts.load({ sessionId: "s1", name: ref.name });
			expect(saved?.data).toContain("xxx");

			// LLM can read it back via read_artifact
			engine.enqueue([callTool("read_artifact", { name: ref.name }), text("read")]);
			const run2 = await registry.getRef(DataAgent).ask({ sessionId: "s1", message: "read it" });
			const readBack = run2.events.find((e) => e.type === "tool_result" && e.tool === "read_artifact");
			expect(JSON.stringify(readBack && "result" in readBack ? readBack.result : "")).toContain("xxx");
		});

		it("per-tool opt-out (@Tool({ offload: false })) preserves the payload intact", async () => {
			engine.enqueue([callTool("fetchBigRaw", { q: "a" }), text("ok")]);
			const run = await registry.getRef(DataAgent).ask({ message: "data" });

			const result = run.events.find((e) => e.type === "tool_result" && e.tool === "fetchBigRaw");
			const payload = result && "result" in result ? (result.result as { rows: string }) : null;
			expect(payload?.rows).toHaveLength(30_000);
		});

		it("per-agent contextPolicy({ offload: { threshold } }) overrides the default", async () => {
			engine.enqueue([callTool("fetchSmall", { q: "a" }), text("ok")]);
			const run = await registry.getRef(TunedAgent).ask({ sessionId: "s2", message: "data" });

			const result = run.events.find((e) => e.type === "tool_result" && e.tool === "fetchSmall");
			const digest = result && "result" in result ? (result.result as Record<string, unknown>) : null;
			expect(digest?.__artifact).toBeDefined();
		});
	});

	describe("HITL — requiresApproval", () => {
		it("run pauses: pending_approval status, approval_required event, tool does NOT execute", async () => {
			engine.enqueue([callTool("transfer", { amount: 500, to: "John" }), text("Awaiting approval.")]);
			const run = await registry.getRef(BankerAgent).ask({ sessionId: "bank-1", message: "transfer 500" });

			expect(run.status).toBe("pending_approval");
			expect(run.pending?.[0]).toMatchObject({ tool: "transfer", args: { amount: 500, to: "John" } });
			expect(run.events.some((e) => e.type === "approval_required")).toBe(true);
			expect(app.get(PaymentService).transfer).not.toHaveBeenCalled();

			// the pending action persists in the session (resumable in another process)
			const session = await app.get(SessionStore).get("bank-1");
			expect(JSON.stringify(session?.state)).toContain("transfer");
		});

		it("approve() executes the tool and resumes the agent; the pending action is cleared", async () => {
			engine.enqueue([callTool("transfer", { amount: 500, to: "John" }), text("Awaiting.")]);
			const ref = registry.getRef(BankerAgent);
			const paused = await ref.ask({ sessionId: "bank-2", message: "transfer 500" });
			const pending = paused.pending?.[0];

			engine.enqueue([text("Transfer completed successfully!")]);
			// biome-ignore lint/style/noNonNullAssertion: pending action guaranteed above
			const resumed = await ref.approve({ sessionId: "bank-2", callId: pending!.callId });

			expect(app.get(PaymentService).transfer).toHaveBeenCalledWith(500, "John");
			expect(resumed.status).toBe("completed");
			expect(resumed.text).toContain("completed");

			const session = await app.get(SessionStore).get("bank-2");
			expect(JSON.stringify(session?.state)).not.toContain("pending");
		});

		it("reject() does NOT execute and informs the agent", async () => {
			engine.enqueue([callTool("transfer", { amount: 500, to: "John" }), text("Awaiting.")]);
			const ref = registry.getRef(BankerAgent);
			const paused = await ref.ask({ sessionId: "bank-3", message: "transfer 500" });

			engine.enqueue([text("No problem, transfer canceled.")]);
			const pendingReject = paused.pending?.[0];
			const resumed = await ref.reject({
				sessionId: "bank-3",
				callId: pendingReject?.callId ?? "",
				reason: "wrong amount",
			});

			expect(app.get(PaymentService).transfer).not.toHaveBeenCalled();
			expect(resumed.text).toContain("canceled");
		});

		it("predicate with DI: prefs off → executes directly without pausing", async () => {
			app.get(PrefsService).requireConfirmation = false;
			engine.enqueue([callTool("transferConditional", { amount: 10, to: "Ana" }), text("Done.")]);

			const run = await registry.getRef(BankerAgent).ask({ sessionId: "bank-4", message: "transfer 10" });

			expect(run.status).toBe("completed");
			expect(app.get(PaymentService).transfer).toHaveBeenCalledWith(10, "Ana");
		});
	});
});
