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
import type { AgentEvent } from "../types/events";

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
	constructor(private readonly payments: PaymentService) {
		super();
	}

	@Tool({ description: "Transfers money.", schema: transferSchema, effect: "destructive" })
	transfer(input: z.infer<typeof transferSchema>) {
		return this.payments.transfer(input.amount, input.to);
	}

	@Tool({ description: "Updates the transfer note.", schema: transferSchema })
	annotate(input: z.infer<typeof transferSchema>) {
		return this.payments.transfer(input.amount, input.to);
	}

	@Tool({ description: "Lists past transfers.", schema: transferSchema, effect: "read" })
	history(input: z.infer<typeof transferSchema>) {
		return this.payments.transfer(input.amount, input.to);
	}
}

@Module({ providers: [PaymentService, DataAgent, TunedAgent, BankerAgent] })
class FeatureModule {}

describe("F7: Continuity (offload + HITL)", () => {
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

	describe("HITL: effect-based approval", () => {
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

		it("stream.approve(): first event is the tool_result with the ORIGINAL callId, then the resumed turn streams", async () => {
			engine.enqueue([callTool("transfer", { amount: 500, to: "John" }), text("Awaiting.")]);
			const ref = registry.getRef(BankerAgent);
			const paused = await ref.ask({ sessionId: "bank-8", message: "transfer 500" });
			const pending = paused.pending?.[0];

			engine.enqueue([text("Transfer completed!")]);
			const events: AgentEvent[] = [];
			// biome-ignore lint/style/noNonNullAssertion: pending action guaranteed above
			for await (const event of ref.stream.approve({ sessionId: "bank-8", callId: pending!.callId })) {
				events.push(event);
			}

			// The head event lets a UI replace its "awaiting approval" row: same callId, real result.
			expect(events[0]).toMatchObject({
				type: "tool_result",
				tool: "transfer",
				callId: pending?.callId,
				result: { receipt: "rc-1" },
			});
			// Everything after it is a normal streamed run, final included.
			expect(events.some((event) => event.type === "run_start")).toBe(true);
			expect(events.at(-1)?.type).toBe("final");
		});

		it("approve() carries the same tool_result in RunResult.events", async () => {
			engine.enqueue([callTool("transfer", { amount: 500, to: "John" }), text("Awaiting.")]);
			const ref = registry.getRef(BankerAgent);
			const paused = await ref.ask({ sessionId: "bank-9", message: "transfer 500" });
			const pending = paused.pending?.[0];

			engine.enqueue([text("Done!")]);
			// biome-ignore lint/style/noNonNullAssertion: pending action guaranteed above
			const resumed = await ref.approve({ sessionId: "bank-9", callId: pending!.callId });

			const head = resumed.events.find((event) => event.type === "tool_result" && event.callId === pending?.callId);
			expect(head && "result" in head && head.result).toEqual({ receipt: "rc-1" });
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

		it("default policy: a write tool (effect unset) executes without pausing", async () => {
			engine.enqueue([callTool("annotate", { amount: 10, to: "Ana" }), text("Done.")]);

			const run = await registry.getRef(BankerAgent).ask({ sessionId: "bank-4", message: "annotate" });

			expect(run.status).toBe("completed");
			expect(app.get(PaymentService).transfer).toHaveBeenCalledWith(10, "Ana");
		});

		it("ask({ approval: 'write' }) tightens: a write tool pauses too", async () => {
			engine.enqueue([callTool("annotate", { amount: 10, to: "Ana" }), text("Awaiting.")]);

			const run = await registry.getRef(BankerAgent).ask({ sessionId: "bank-5", message: "annotate", approval: "write" });

			expect(run.status).toBe("pending_approval");
			expect(app.get(PaymentService).transfer).not.toHaveBeenCalled();
		});

		it("ask({ approval: 'write' }) still lets a read tool through", async () => {
			engine.enqueue([callTool("history", { amount: 1, to: "Ana" }), text("Here.")]);

			const run = await registry.getRef(BankerAgent).ask({ sessionId: "bank-6", message: "history", approval: "write" });

			expect(run.status).toBe("completed");
			expect(app.get(PaymentService).transfer).toHaveBeenCalledWith(1, "Ana");
		});

		it("ask({ approval: 'none' }) disables the gate for this run", async () => {
			engine.enqueue([callTool("transfer", { amount: 99, to: "Ana" }), text("Done.")]);

			const run = await registry.getRef(BankerAgent).ask({ sessionId: "bank-7", message: "transfer", approval: "none" });

			expect(run.status).toBe("completed");
			expect(app.get(PaymentService).transfer).toHaveBeenCalledWith(99, "Ana");
		});
	});
});
