import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { Instant } from "../../common/time/instant";
import { SkillActivated } from "../../domain/event/catalog/skill-activated";
import { ToolResultProduced } from "../../domain/event/catalog/tool-result-produced";
import { PendingCall } from "../../domain/session/pending-call";
import { RunLimits } from "../../domain/session/run-limits";
import { SkillDefinition } from "../../domain/skill/skill-definition";
import { EffectApprovalPolicy } from "../../domain/tool/effect-approval-policy";
import { ParsedArguments } from "../../domain/tool/parsed-arguments";
import { ToolDefinition } from "../../domain/tool/tool-definition";
import { ToolEffect } from "../../domain/tool/tool-effect";
import { ToolHandler } from "../../domain/tool/tool-handler";
import { ToolSchema } from "../../domain/tool/tool-schema";
import { FakeClock } from "../../support/fake-clock";
import { NativeStackFixture } from "../../support/run/native-stack.fixture";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { ArtifactOffloader } from "../artifact/artifact-offloader";
import { ActiveRunTracker } from "../lifecycle/active-run-tracker";
import { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle";
import { ShutdownOptions } from "../lifecycle/shutdown-options";
import { ToolExecutor } from "../tool/tool-executor";
import { AgentRunFactory } from "./agent-run-factory";
import { RunEventFactory } from "./run-event-factory";
import { RunJournal } from "./run-journal";
import type { RunScope } from "./run-scope";
import { RunScopeFactory } from "./run-scope-factory";
import { TurnExecutor } from "./turn-executor";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const clock = new FakeClock(NOW);
const model = new ScriptedModel("primary");
const REFUND = ToolCallId.from("c-1");
const LOOKUP = ToolCallId.from("c-2");

class AnySchema extends ToolSchema {
	public declaration(): unknown {
		return { type: "object" };
	}

	public parse(args: unknown): ParsedArguments {
		return ParsedArguments.valid(typeof args === "object" && args !== null ? { ...args } : {});
	}
}

/** Remembers the order it was called in, which is the whole point of running a turn in sequence. */
class OrderedHandler extends ToolHandler {
	public constructor(
		private readonly log: string[],
		private readonly name: string,
	) {
		super();
	}

	public async invoke(): Promise<unknown> {
		this.log.push(this.name);
		return { done: this.name };
	}
}

function toolOf(name: string, handler: ToolHandler, effect = ToolEffect.WRITE): ToolDefinition {
	return new ToolDefinition(name, "does something", new AnySchema(), effect, handler);
}

async function scopeOf(tools: readonly ToolDefinition[], skills: readonly SkillDefinition[] = []): Promise<RunScope> {
	const tracker = new ActiveRunTracker();
	const lifecycle = new RuntimeLifecycle(tracker, ShutdownOptions.waitIndefinitely(), clock);
	const started = new AgentRunFactory(new SequenceIdGenerator("run"), clock, tracker, lifecycle).start(
		SessionId.from("s-1"),
		NativeStackFixture.AGENT,
	);
	const definition = NativeStackFixture.definitionOf(model, undefined, tools, skills);
	return await new RunScopeFactory().create(definition, model, started, [], RunLimits.none());
}

function executorOf(): TurnExecutor {
	const journal = new RunJournal(new RunEventFactory(new SequenceIdGenerator("e"), clock));
	const offloader = new ArtifactOffloader(new InMemoryArtifactStorage(new SequenceIdGenerator("a")));
	return new TurnExecutor(new ToolExecutor(offloader, EffectApprovalPolicy.never()), journal);
}

/** Reports when it started and when it finished, which is how overlap is proved without a clock. */
class OverlappingHandler extends ToolHandler {
	public constructor(
		private readonly log: string[],
		private readonly name: string,
	) {
		super();
	}

	public async invoke(): Promise<unknown> {
		this.log.push(`start ${this.name}`);
		await new Promise((resolve) => setTimeout(resolve, 5));
		this.log.push(`end ${this.name}`);
		return { done: this.name };
	}
}

function readOf(name: string, handler: ToolHandler): ToolDefinition {
	return toolOf(name, handler, ToolEffect.READ);
}

describe("TurnExecutor", () => {
	it("runs the calls in the order the model asked for them, one at a time", async () => {
		const order: string[] = [];
		const scope = await scopeOf([
			toolOf("refund_order", new OrderedHandler(order, "refund")),
			toolOf("close_order", new OrderedHandler(order, "close")),
		]);

		await executorOf().execute(
			scope,
			[new PendingCall(REFUND, "refund_order", {}), new PendingCall(LOOKUP, "close_order", {})],
			false,
		);

		expect(order).toEqual(["refund", "close"]);
	});

	it("records a result for every call, so none is left open in the journal", async () => {
		const order: string[] = [];
		const scope = await scopeOf([
			toolOf("refund_order", new OrderedHandler(order, "refund")),
			toolOf("close_order", new OrderedHandler(order, "close")),
		]);

		const batch = await executorOf().execute(
			scope,
			[new PendingCall(REFUND, "refund_order", {}), new PendingCall(LOOKUP, "close_order", {})],
			false,
		);

		expect(batch.events.map((event) => event.type)).toEqual([ToolResultProduced.TYPE, ToolResultProduced.TYPE]);
	});

	it("answers a refused call with the refusal, without running it", async () => {
		const order: string[] = [];
		const scope = await scopeOf([toolOf("refund_order", new OrderedHandler(order, "refund"))]);

		const batch = await executorOf().execute(
			scope,
			[new PendingCall(REFUND, "refund_order", {}, "write", "denied", "not authorized")],
			true,
		);

		expect(order).toEqual([]);
		const result = batch.events[0];
		expect(result).toBeInstanceOf(ToolResultProduced);
		if (result instanceof ToolResultProduced) expect(result.output.error).toBe("not authorized");
	});

	it("journals the activation next to the result that carried the skill", async () => {
		const legal = SkillDefinition.onDemand("legal", "The terms", "the very long terms");
		const scope = await scopeOf([toolOf("noop", new OrderedHandler([], "noop"))], [legal]);

		const batch = await executorOf().execute(
			scope,
			[new PendingCall(REFUND, "activate_skill", { skillName: "legal" })],
			false,
		);

		expect(batch.events.map((event) => event.type)).toEqual([ToolResultProduced.TYPE, SkillActivated.TYPE]);
		const activated = batch.events[1];
		expect(activated).toBeInstanceOf(SkillActivated);
		if (activated instanceof SkillActivated) expect(activated.callId.value).toBe(REFUND.value);
	});

	it("journals no activation for a call that was not one", async () => {
		const scope = await scopeOf([toolOf("refund_order", new OrderedHandler([], "refund"))]);

		const batch = await executorOf().execute(scope, [new PendingCall(REFUND, "refund_order", {})], false);

		expect(batch.events).toHaveLength(1);
	});
});

describe("TurnExecutor overlap", () => {
	const A = ToolCallId.from("p-1");
	const B = ToolCallId.from("p-2");
	const C = ToolCallId.from("p-3");

	it("runs consecutive reads at the same time", async () => {
		const order: string[] = [];
		const scope = await scopeOf([
			readOf("lookup_order", new OverlappingHandler(order, "one")),
			readOf("lookup_customer", new OverlappingHandler(order, "two")),
		]);

		await executorOf().execute(
			scope,
			[new PendingCall(A, "lookup_order", {}), new PendingCall(B, "lookup_customer", {})],
			false,
		);

		expect(order).toEqual(["start one", "start two", "end one", "end two"]);
	});

	it("never overlaps a write with anything, in either direction", async () => {
		const order: string[] = [];
		const scope = await scopeOf([
			readOf("lookup_order", new OverlappingHandler(order, "read-before")),
			toolOf("refund_order", new OverlappingHandler(order, "write")),
			readOf("lookup_customer", new OverlappingHandler(order, "read-after")),
		]);

		await executorOf().execute(
			scope,
			[
				new PendingCall(A, "lookup_order", {}),
				new PendingCall(B, "refund_order", {}),
				new PendingCall(C, "lookup_customer", {}),
			],
			false,
		);

		expect(order).toEqual([
			"start read-before",
			"end read-before",
			"start write",
			"end write",
			"start read-after",
			"end read-after",
		]);
	});

	it("journals the results in the order the model asked, whatever order they finished in", async () => {
		const scope = await scopeOf([readOf("slow_lookup", new SlowHandler(20)), readOf("fast_lookup", new SlowHandler(1))]);

		const batch = await executorOf().execute(
			scope,
			[new PendingCall(A, "slow_lookup", {}), new PendingCall(B, "fast_lookup", {})],
			false,
		);

		const results = batch.events.filter((event) => event instanceof ToolResultProduced);
		expect(results.map((event) => event.toolName)).toEqual(["slow_lookup", "fast_lookup"]);
	});

	it("runs a tool the catalog does not know on its own, because nobody can name its effect", async () => {
		const order: string[] = [];
		const scope = await scopeOf([readOf("lookup_order", new OverlappingHandler(order, "known"))]);

		const batch = await executorOf().execute(
			scope,
			[new PendingCall(A, "ghost_tool", {}), new PendingCall(B, "lookup_order", {})],
			false,
		);

		expect(order).toEqual(["start known", "end known"]);
		expect(batch.events.filter((event) => event instanceof ToolResultProduced)).toHaveLength(2);
	});
});

/** Finishes after a set delay, so a test can make the fast call finish before the slow one. */
class SlowHandler extends ToolHandler {
	public constructor(private readonly delay: number) {
		super();
	}

	public async invoke(): Promise<unknown> {
		await new Promise((resolve) => setTimeout(resolve, this.delay));
		return { done: true };
	}
}
