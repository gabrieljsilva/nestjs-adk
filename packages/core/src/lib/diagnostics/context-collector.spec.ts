import type { RunResult } from "../types/events";
import { ContextCollector } from "./context-collector";
import type { ContextSnapshot } from "./context-types";

function result(text: string): RunResult {
	return { text, usage: { promptTokens: 1, outputTokens: 1, totalTokens: 2 }, events: [], status: "completed" };
}

const snapshot: ContextSnapshot = { agent: "support", segments: [{ kind: "systemInstruction", text: "hi" }] };

describe("ContextCollector", () => {
	afterEach(() => {
		ContextCollector.setActive(undefined);
	});

	it("has no active instance until the module sets one", () => {
		expect(ContextCollector.getActive()).toBeUndefined();

		const collector = new ContextCollector();
		ContextCollector.setActive(collector);
		expect(ContextCollector.getActive()).toBe(collector);
	});

	it("open() hands out a fresh bucket per run, so concurrent runs never mix", () => {
		const collector = new ContextCollector();
		const first = collector.open();
		const second = collector.open();

		first.push(snapshot);
		expect(second).toHaveLength(0);
		expect(first).not.toBe(second);
	});

	it("correlates snapshots to the exact result object", () => {
		const collector = new ContextCollector();
		const runA = result("a");
		const runB = result("b");

		collector.attach(runA, [snapshot]);

		expect(collector.snapshotsOf(runA)).toEqual([snapshot]);
		expect(collector.snapshotsOf(runB)).toBeUndefined();
	});

	it("keys by identity: an equal-looking result is not the same run", () => {
		const collector = new ContextCollector();
		const run = result("same");
		collector.attach(run, [snapshot]);

		expect(collector.snapshotsOf(result("same"))).toBeUndefined();
	});

	it("late pushes into the bucket still reach the correlated result", () => {
		const collector = new ContextCollector();
		const run = result("a");
		const bucket = collector.open();

		collector.attach(run, bucket);
		bucket.push(snapshot);

		expect(collector.snapshotsOf(run)).toHaveLength(1);
	});
});

describe("capture is gated by the collector, not by the caller", () => {
	it("an input-supplied bucket does nothing while diagnostics are off", async () => {
		const { AdkModule, AdkEngine, ScriptedEngine, Agent, AdkAgent, text } = await import("../../index");
		const { Test } = await import("@nestjs/testing");

		@Agent({ name: "gated", model: "test", description: "d", prompt: "p" })
		class GatedAgent extends AdkAgent {}

		const module = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: ScriptedEngine, defaultModel: "test" })],
			providers: [GatedAgent],
		}).compile();
		await module.init();
		(module.get(AdkEngine) as InstanceType<typeof ScriptedEngine>).push(text("ok"));

		// a caller passing `capture` must not switch capture on behind the module's back
		const smuggled: ContextSnapshot[] = [];
		await module.get(GatedAgent).ask({ message: "hi", capture: smuggled });

		expect(smuggled).toHaveLength(0);
		await module.close();
	});
});
