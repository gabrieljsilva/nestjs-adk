import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodToolSchema } from "../../adapters/schema/zod-tool-schema.adapter";
import { ToolCallId } from "../../common/identity/tool-call-id.value-object";
import { ContextSummarizer } from "../../contracts/context/context-summarizer.contract";
import { BackoffRetryPolicy } from "../../domain/agent/backoff-retry.policy";
import { RunLimits } from "../../domain/session/run/run-limits.value-object";
import { OpenAccessPolicy } from "../../domain/tool/access/open-access.policy";
import { ToolEffect } from "../../domain/tool/approval/tool-effect.value-object";
import { ToolHandler } from "../../domain/tool/invocation/tool-handler.contract";
import { ToolInvocation } from "../../domain/tool/invocation/tool-invocation.value-object";
import { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ContextMeasurer } from "../context/context-measurer.service";
import { OldestFirstCompactionStrategy } from "../context/oldest-first-compaction.strategy";
import { FieldNameEventRedactor } from "../event/field-name-event-redactor.adapter";
import { ShutdownOptions } from "../lifecycle/shutdown.options";
import { LifecycleOptions } from "./lifecycle.options";
import { RuntimeOptions } from "./runtime.options";

const INVOCATION = new ToolInvocation(ToolCallId.from("c-1"), "refund", {});
class DoesNothing extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return "done";
	}
}

const toolOf = (effect: ToolEffect) =>
	new ToolDefinition("refund", "Refunds an order", ZodToolSchema.fromSchema(z.object({})), effect, new DoesNothing());

/** A summarizer is only ever identity-compared here, so the cheapest one that compiles will do. */
class CountsWords extends ContextSummarizer {
	public async summarize(): Promise<string> {
		return "summary";
	}
}

describe("RuntimeOptions", () => {
	it("waits indefinitely and caps the run at fifty iterations when the application chose nothing", () => {
		const options = new RuntimeOptions();

		expect(options.lifecycle.shutdown.waitsIndefinitely).toBe(true);
		expect(options.limits.maxIterations).toBe(RunLimits.DEFAULT_MAX_ITERATIONS);
	});

	/** The ceiling is a default and not a rule: taking it off is a declaration anyone can make. */
	it("has no ceiling at all once the application asks for none", () => {
		expect(RuntimeOptions.from({ limits: RunLimits.unbounded() }).limits.hasIterationLimit).toBe(false);
	});

	it("holds a destructive tool for a human, which is the safe half of the trade", () => {
		const options = new RuntimeOptions();

		expect(options.tools.approvals.requires(toolOf(ToolEffect.DESTRUCTIVE), INVOCATION)).toBe(true);
		expect(options.tools.approvals.requires(toolOf(ToolEffect.READ), INVOCATION)).toBe(false);
	});

	it("carries the compaction strategy and the redactor the application declared", () => {
		const compactionStrategy = new OldestFirstCompactionStrategy(new ContextMeasurer());
		const redactor = new FieldNameEventRedactor(["senha"]);

		const options = RuntimeOptions.from({ context: { compactionStrategy }, lifecycle: { redactor } });

		expect(options.context.compactionStrategy).toBe(compactionStrategy);
		expect(options.lifecycle.redactor).toBe(redactor);
		expect(new RuntimeOptions().context.compactionStrategy).toBeUndefined();
		expect(new RuntimeOptions().lifecycle.redactor).toBeInstanceOf(FieldNameEventRedactor);
	});

	it("leaves the optional ports absent rather than substituting a default for them", () => {
		const options = new RuntimeOptions();

		expect(options.model.resolver).toBeUndefined();
		expect(options.context.summarizer).toBeUndefined();
		expect(options.context.contextNotices).toBeUndefined();
		expect(options.lifecycle.consumerNotices).toBeUndefined();
		expect(options.cost.pricing).toBeUndefined();
	});

	it("explores an artifact whole up to twenty million characters unless the application says otherwise", () => {
		expect(new RuntimeOptions().context.maxExplorableCharacters).toBe(20_000_000);
		expect(RuntimeOptions.from({ context: { maxExplorableCharacters: 5_000 } }).context.maxExplorableCharacters).toBe(
			5_000,
		);
	});

	it("retries a model twice before failover is consulted, without anybody asking for it", () => {
		expect(new RuntimeOptions().model.retry).toBeInstanceOf(BackoffRetryPolicy);
	});

	it("watches nothing until somebody declares a consumer", () => {
		expect(new RuntimeOptions().lifecycle.consumers).toHaveLength(0);
	});

	it("carries the module wide limits the agent and the call may narrow", () => {
		const options = new RuntimeOptions(
			undefined,
			undefined,
			undefined,
			LifecycleOptions.from({ shutdown: ShutdownOptions.withTimeout(1000) }),
			undefined,
			new RunLimits(6),
		);

		expect(options.limits.maxIterations).toBe(6);
		expect(options.lifecycle.shutdown.waitsIndefinitely).toBe(false);
	});

	it("builds from a nested literal with the same defaults as declaring none", () => {
		const options = RuntimeOptions.from({ limits: new RunLimits(3) });

		expect(options.limits.maxIterations).toBe(3);
		expect(options.lifecycle.shutdown.waitsIndefinitely).toBe(true);
		expect(options.lifecycle.consumers).toHaveLength(0);
	});

	it("patches only the named fields and keeps every other one", () => {
		const declared = RuntimeOptions.from({
			lifecycle: { shutdown: ShutdownOptions.withTimeout(1000) },
			limits: new RunLimits(6),
		});

		const patched = declared.with({ limits: new RunLimits(2) });

		expect(patched.limits.maxIterations).toBe(2);
		expect(patched.lifecycle.shutdown).toBe(declared.lifecycle.shutdown);
		expect(patched.tools.approvals).toBe(declared.tools.approvals);
	});

	/** The reason a group is merged and not replaced: one field named keeps the ones beside it. */
	it("keeps the rest of a group when a patch names one field of it", () => {
		const summarizer = new CountsWords();
		const declared = RuntimeOptions.from({ context: { summarizer, compaction: false } });

		const patched = declared.with({ context: { compaction: false } });

		expect(patched.context.summarizer).toBe(summarizer);
		expect(patched.context.compaction).toBe(false);
	});

	it("answers a new instance from a patch, leaving the original untouched", () => {
		const declared = new RuntimeOptions();

		const patched = declared.with({ limits: new RunLimits(2) });

		expect(patched).not.toBe(declared);
		expect(declared.limits.maxIterations).toBe(RunLimits.DEFAULT_MAX_ITERATIONS);
	});

	it("lets everyone call everything until the application declares an access policy", () => {
		expect(new RuntimeOptions().tools.access).toBeInstanceOf(OpenAccessPolicy);
	});

	it("carries the access policy the application declared", () => {
		const access = new OpenAccessPolicy();

		expect(RuntimeOptions.from({ tools: { access } }).tools.access).toBe(access);
		expect(new RuntimeOptions().with({ tools: { access } }).tools.access).toBe(access);
	});
});
