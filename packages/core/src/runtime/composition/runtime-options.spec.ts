import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodToolSchema } from "../../adapters/schema/zod-tool-schema";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { RunLimits } from "../../domain/session/run-limits";
import { OpenAccessPolicy } from "../../domain/tool/open-access-policy";
import { ToolDefinition } from "../../domain/tool/tool-definition";
import { ToolEffect } from "../../domain/tool/tool-effect";
import { ToolHandler } from "../../domain/tool/tool-handler";
import { ToolInvocation } from "../../domain/tool/tool-invocation";
import { ContextMeasurer } from "../context/context-measurer";
import { OldestFirstCompactionStrategy } from "../context/oldest-first-compaction-strategy";
import { FieldNameEventRedactor } from "../event/field-name-event-redactor";
import { ShutdownOptions } from "../lifecycle/shutdown-options";
import { RuntimeOptions } from "./runtime-options";

const INVOCATION = new ToolInvocation(ToolCallId.from("c-1"), "refund", {});
class DoesNothing extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return "done";
	}
}

const toolOf = (effect: ToolEffect) =>
	new ToolDefinition("refund", "Refunds an order", ZodToolSchema.of(z.object({})), effect, new DoesNothing());

describe("RuntimeOptions", () => {
	it("waits indefinitely and caps the run at fifty iterations when the application chose nothing", () => {
		const options = new RuntimeOptions();

		expect(options.shutdown.waitsIndefinitely).toBe(true);
		expect(options.limits.maxIterations).toBe(RunLimits.DEFAULT_MAX_ITERATIONS);
	});

	/** The ceiling is a default and not a rule: taking it off is a declaration anyone can make. */
	it("has no ceiling at all once the application asks for none", () => {
		expect(RuntimeOptions.from({ limits: RunLimits.unbounded() }).limits.hasIterationLimit).toBe(false);
	});

	it("holds a destructive tool for a human, which is the safe half of the trade", () => {
		const options = new RuntimeOptions();

		expect(options.approvals.requires(toolOf(ToolEffect.DESTRUCTIVE), INVOCATION)).toBe(true);
		expect(options.approvals.requires(toolOf(ToolEffect.READ), INVOCATION)).toBe(false);
	});

	it("carries the compaction strategy and the redactor the application declared", () => {
		const compactionStrategy = new OldestFirstCompactionStrategy(new ContextMeasurer());
		const redactor = new FieldNameEventRedactor(["senha"]);

		const options = RuntimeOptions.from({ compactionStrategy, redactor });

		expect(options.compactionStrategy).toBe(compactionStrategy);
		expect(options.redactor).toBe(redactor);
		expect(new RuntimeOptions().compactionStrategy).toBeUndefined();
		expect(new RuntimeOptions().redactor).toBeInstanceOf(FieldNameEventRedactor);
	});

	it("leaves the optional ports absent rather than substituting a default for them", () => {
		const options = new RuntimeOptions();

		expect(options.models).toBeUndefined();
		expect(options.summarizer).toBeUndefined();
		expect(options.contextNotices).toBeUndefined();
		expect(options.consumerNotices).toBeUndefined();
	});

	it("watches nothing until somebody declares a consumer", () => {
		expect(new RuntimeOptions().consumers).toHaveLength(0);
	});

	it("carries the module wide limits the agent and the call may narrow", () => {
		const options = new RuntimeOptions(ShutdownOptions.withTimeout(1000), RunLimits.of(6));

		expect(options.limits.maxIterations).toBe(6);
		expect(options.shutdown.waitsIndefinitely).toBe(false);
	});

	it("builds from a literal with the same defaults as declaring none", () => {
		const options = RuntimeOptions.from({ limits: RunLimits.of(3) });

		expect(options.limits.maxIterations).toBe(3);
		expect(options.shutdown.waitsIndefinitely).toBe(true);
		expect(options.consumers).toHaveLength(0);
	});

	it("patches only the named fields and keeps every other one", () => {
		const declared = new RuntimeOptions(ShutdownOptions.withTimeout(1000), RunLimits.of(6));

		const patched = declared.with({ limits: RunLimits.of(2) });

		expect(patched.limits.maxIterations).toBe(2);
		expect(patched.shutdown).toBe(declared.shutdown);
		expect(patched.approvals).toBe(declared.approvals);
	});

	it("answers a new instance from a patch, leaving the original untouched", () => {
		const declared = new RuntimeOptions();

		const patched = declared.with({ limits: RunLimits.of(2) });

		expect(patched).not.toBe(declared);
		expect(declared.limits.maxIterations).toBe(RunLimits.DEFAULT_MAX_ITERATIONS);
	});

	it("lets everyone call everything until the application declares an access policy", () => {
		expect(new RuntimeOptions().access).toBeInstanceOf(OpenAccessPolicy);
	});

	it("carries the access policy the application declared", () => {
		const access = new OpenAccessPolicy();

		expect(RuntimeOptions.from({ access }).access).toBe(access);
		expect(new RuntimeOptions().with({ access }).access).toBe(access);
	});
});
