import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { Instant } from "../../common/time/instant";
import { RunLimits } from "../../domain/session/run-limits";
import { SkillDefinition } from "../../domain/skill/skill-definition";
import { ParsedArguments } from "../../domain/tool/parsed-arguments";
import { ToolDefinition } from "../../domain/tool/tool-definition";
import { ToolEffect } from "../../domain/tool/tool-effect";
import { ToolHandler } from "../../domain/tool/tool-handler";
import { ToolSchema } from "../../domain/tool/tool-schema";
import { FakeClock } from "../../support/fake-clock";
import { NativeStackFixture } from "../../support/run/native-stack.fixture";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { ActiveRunTracker } from "../lifecycle/active-run-tracker";
import { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle";
import { ShutdownOptions } from "../lifecycle/shutdown-options";
import { AgentRunFactory } from "./agent-run-factory";
import { RunScopeFactory } from "./run-scope-factory";
import type { StartedRun } from "./started-run";

const model = new ScriptedModel("primary");

class AnySchema extends ToolSchema {
	public declaration(): unknown {
		return { type: "object" };
	}

	public parse(): ParsedArguments {
		return ParsedArguments.valid({});
	}
}

class SilentHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return {};
	}
}

function toolOf(name: string): ToolDefinition {
	return new ToolDefinition(name, "does something", new AnySchema(), ToolEffect.READ, new SilentHandler());
}

function startedRun(): StartedRun {
	const clock = new FakeClock(Instant.fromIso("2026-01-01T00:00:00.000Z"));
	const tracker = new ActiveRunTracker();
	const lifecycle = new RuntimeLifecycle(tracker, ShutdownOptions.waitIndefinitely(), clock);
	return new AgentRunFactory(new SequenceIdGenerator("run"), clock, tracker, lifecycle).start(
		SessionId.from("s-1"),
		NativeStackFixture.AGENT,
	);
}

const readArtifact = toolOf("read_artifact");

describe("RunScopeFactory", () => {
	it("offers the agent tools together with the ones the runtime always brings", () => {
		const definition = NativeStackFixture.definitionOf(model, undefined, [toolOf("lookup_order")]);

		const scope = new RunScopeFactory([readArtifact]).create(definition, model, startedRun());

		expect(scope.catalog.names).toEqual(["lookup_order", "read_artifact"]);
	});

	it("offers nothing at all to an agent that declared nothing to call", () => {
		const scope = new RunScopeFactory([readArtifact]).create(NativeStackFixture.definitionOf(model), model, startedRun());

		expect(scope.catalog.names).toEqual([]);
	});

	it("adds what the sources opened, alongside what the agent declared", () => {
		const definition = NativeStackFixture.definitionOf(model, undefined, [toolOf("lookup_order")]);

		const scope = new RunScopeFactory().create(definition, model, startedRun(), [toolOf("remote_search")]);

		expect(scope.catalog.names).toEqual(["lookup_order", "remote_search"]);
	});

	it("offers the way to load a skill only to an agent that has one to load", () => {
		const definition = NativeStackFixture.definitionOf(
			model,
			undefined,
			[],
			[SkillDefinition.onDemand("legal", "The terms", "the long terms")],
		);

		const scope = new RunScopeFactory().create(definition, model, startedRun());

		expect(scope.catalog.names).toContain("activate_skill");
	});

	it("lets each level narrow the one above it, and leaves untouched what a level did not declare", () => {
		const definition = NativeStackFixture.definitionOf(model);
		const factory = new RunScopeFactory([], RunLimits.of(10, 5));

		const scope = factory.create(definition, model, startedRun(), [], RunLimits.of(2));

		expect(scope.limits.maxIterations).toBe(2);
		expect(scope.limits.maxConsecutiveToolFailures).toBe(5);
	});

	it("builds the breaker on the limits it resolved, and not on the ones it was given", () => {
		const factory = new RunScopeFactory([], RunLimits.of(undefined, 1));

		const scope = factory.create(NativeStackFixture.definitionOf(model), model, startedRun());

		expect(() => scope.breaker.recordFailure("lookup_order", "boom")).toThrow();
	});
});
