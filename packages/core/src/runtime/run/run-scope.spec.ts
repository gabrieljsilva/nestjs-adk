import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { Instant } from "../../common/time/instant";
import { RunLimits } from "../../domain/session/run-limits";
import { FakeClock } from "../../support/fake-clock";
import { NativeStackFixture } from "../../support/run/native-stack.fixture";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { ActiveRunTracker } from "../lifecycle/active-run-tracker";
import { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle";
import { ShutdownOptions } from "../lifecycle/shutdown-options";
import { SkillCatalog } from "../skill/skill-catalog";
import { ToolBreaker } from "../tool/tool-breaker";
import { ToolCatalog } from "../tool/tool-catalog";
import { AgentRunFactory } from "./agent-run-factory";
import type { RunScope } from "./run-scope";
import { RunScopeFactory } from "./run-scope-factory";
import type { StartedRun } from "./started-run";

const SESSION = SessionId.from("s-1");
const model = new ScriptedModel("primary");
const definition = NativeStackFixture.definitionOf(model);

function startedRun(): StartedRun {
	const clock = new FakeClock(Instant.fromIso("2026-01-01T00:00:00.000Z"));
	const tracker = new ActiveRunTracker();
	const lifecycle = new RuntimeLifecycle(tracker, ShutdownOptions.waitIndefinitely(), clock);
	return new AgentRunFactory(new SequenceIdGenerator("run"), clock, tracker, lifecycle).start(
		SESSION,
		NativeStackFixture.AGENT,
	);
}

async function scopeOf(): Promise<RunScope> {
	return await new RunScopeFactory().create(definition, model, startedRun(), [], RunLimits.none());
}

describe("RunScope", () => {
	it("answers the agent, the run and the session without anyone reaching through it", async () => {
		const scope = await scopeOf();

		expect(scope.agent.value).toBe(NativeStackFixture.AGENT.value);
		expect(scope.sessionId.value).toBe(SESSION.value);
		expect(scope.run.id.value).toBeTruthy();
		expect(scope.definition).toBe(definition);
	});

	it("carries the catalog, the skills and the breaker that belong to this run alone", async () => {
		const scope = await scopeOf();

		expect(scope.catalog).toBeInstanceOf(ToolCatalog);
		expect(scope.skills).toBeInstanceOf(SkillCatalog);
		expect(scope.breaker).toBeInstanceOf(ToolBreaker);
	});

	it("gives each run its own breaker, so a tool failing in one never stops another", async () => {
		expect((await scopeOf()).breaker).not.toBe((await scopeOf()).breaker);
	});

	it("hands out the signal that stops the run, which every call it makes has to obey", async () => {
		expect((await scopeOf()).signal).toBeDefined();
	});
});
