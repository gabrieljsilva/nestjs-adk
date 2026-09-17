import { describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage.adapter";
import { CorrelationId } from "../../common/identity/correlation-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ToolCallId } from "../../common/identity/tool-call-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { Instant } from "../../common/time/instant.value-object";
import { ModelResolver } from "../../contracts/model/model-resolver.contract";
import { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import { AgentDelegationPolicy } from "../../domain/agent/agent-delegation.policy";
import { AgentDescription } from "../../domain/agent/agent-description.value-object";
import { AgentExecutionPolicies } from "../../domain/agent/agent-execution-policies.value-object";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { DeclaredAgent } from "../../domain/agent/declared-agent.value-object";
import { DelegationNotDeclaredError } from "../../domain/agent/errors/delegation-not-declared.error";
import type { LlmModel } from "../../domain/model/llm-model.contract";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { PendingCall } from "../../domain/session/approval/pending-call.value-object";
import { AgentMaxDelegationDepthError } from "../../domain/session/errors/agent-max-delegation-depth.error";
import { Session } from "../../domain/session/session.entity";
import { SessionState } from "../../domain/session/state/session-state.value-object";
import { FakeClock } from "../../support/fake-clock.double";
import { RunContextFixture } from "../../support/run/run-context.fixture";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { AgentCatalog } from "../catalog/agent-catalog.service";
import { ActiveRunTracker } from "../lifecycle/active-run-tracker.service";
import { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle.service";
import { ShutdownOptions } from "../lifecycle/shutdown.options";
import { AgentRunFactory } from "../run/agent-run.factory";
import { RunEventFactory } from "../run/journal/run-event.factory";
import { RunJournal } from "../run/journal/run-journal.service";
import { RunScopeFactory } from "../run/scope/run-scope.factory";
import { RunProgress } from "../run/settle/run-progress.value-object";
import type { StartedRun } from "../run/settle/started-run.value-object";
import { OpenedSession } from "../session/opened-session.value-object";
import { SessionManager } from "../session/session-manager.service";
import { DelegatedTurnLoop } from "./delegated-turn-loop.contract";
import { DelegationRunner } from "./delegation-runner.service";
import { DelegationUnboundError } from "./errors/delegation-unbound.error";

const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");
const SUPPORT = AgentName.from("support");
const RESEARCHER = AgentName.from("researcher");
const SESSION = SessionId.from("s-1");
const MODEL = new ScriptedModel("primary");

class FixedResolver extends ModelResolver {
	public resolve(): LlmModel {
		return MODEL;
	}
}

/** Answers the task and records the scope it was given, which is what a delegation produces. */
class AnsweringLoop extends DelegatedTurnLoop {
	public depths: number[] = [];

	public constructor(private readonly answer = "42") {
		super();
	}

	public async run(scope: { run: { depth: number } }, _opened: OpenedSession, progress: RunProgress): Promise<void> {
		this.depths.push(scope.run.depth);
		progress.said(this.answer);
	}
}

function agent(name: AgentName, delegation: AgentDelegationPolicy = AgentDelegationPolicy.none()): AgentDefinition {
	return AgentDefinition.of(
		name,
		AgentDescription.from(`${name.value} agent`, name.value),
		MODEL,
		undefined,
		AgentExecutionPolicies.of(undefined, undefined, undefined, undefined, delegation),
	);
}

/** Answers a different model every call, which is what a resolver routing by load or cost does. */
class AlternatingResolver extends ModelResolver {
	public calls = 0;

	public resolve(): LlmModel {
		this.calls += 1;
		return new ScriptedModel(`model-${this.calls}`);
	}
}

function stack(support: AgentDefinition, models: ModelResolver = new FixedResolver()) {
	const storage = new InMemorySessionStorage();
	const clock = new FakeClock(NOW);
	const ids = new SequenceIdGenerator("id");
	const tracker = new ActiveRunTracker();
	const lifecycle = new RuntimeLifecycle(tracker, ShutdownOptions.waitIndefinitely(), clock);
	const sessions = new SessionManager(storage);
	const catalog = AgentCatalog.of([
		new DeclaredAgent(support, "SupportAgent"),
		new DeclaredAgent(agent(RESEARCHER), "ResearchAgent"),
	]);
	const runs = new AgentRunFactory(ids, clock, tracker, lifecycle);
	const scopes = new RunScopeFactory();
	const journal = new RunJournal(new RunEventFactory(ids, clock));
	const runner = new DelegationRunner(catalog, models, runs, scopes, journal, sessions);
	return { storage, clock, sessions, runs, scopes, runner, support };
}

async function openedSession(sessions: SessionManager): Promise<OpenedSession> {
	const session = Session.start(SESSION, SUPPORT, NOW);
	await sessions.create(SessionContext.fromSessionId(SESSION), session);
	return new OpenedSession(session, SessionState.initial(), true);
}

function contextOf(started: StartedRun) {
	return RunContextFixture.run(SESSION, { agent: SUPPORT, runId: started.run.id.value });
}

function delegateCall(agentName: string, task = "find the policy"): PendingCall {
	return new PendingCall(ToolCallId.from("d-1"), "delegate_to_agent", { agentName, task });
}

describe("DelegationRunner", () => {
	it("answers the call that asked, with what the child said", async () => {
		const declared = agent(SUPPORT, AgentDelegationPolicy.to([RESEARCHER]));
		const built = stack(declared);
		built.runner.uses(new AnsweringLoop("the window is 30 days"));
		const opened = await openedSession(built.sessions);
		const started = built.runs.start(SESSION, SUPPORT);
		const scope = await built.scopes.create(contextOf(started), declared, MODEL, started);

		const answers = await built.runner.runAll(scope, opened, new RunProgress(opened.state), [delegateCall("researcher")]);

		expect(answers.get("d-1")).toBe("the window is 30 days");
	});

	/**
	 * The journal has to name the model that answered, not another one the resolver would give.
	 *
	 * A resolver is a port, so it is allowed to decide by load, cost or time of day, and asking
	 * it twice is asking two different questions. Resolving once and carrying the answer is what
	 * keeps the record of the delegation and the delegation itself the same event.
	 */
	it("journals the model that served the child, not a second answer from the resolver", async () => {
		const resolver = new AlternatingResolver();
		const declared = agent(SUPPORT, AgentDelegationPolicy.to([RESEARCHER]));
		const built = stack(declared, resolver);
		built.runner.uses(new AnsweringLoop());
		const opened = await openedSession(built.sessions);
		const started = built.runs.start(SESSION, SUPPORT);
		const scope = await built.scopes.create(contextOf(started), declared, MODEL, started);

		await built.runner.runAll(scope, opened, new RunProgress(opened.state), [delegateCall("researcher")]);

		const written: unknown[] = [];
		for await (const event of built.storage.readEvents(SessionContext.fromSessionId(SESSION), SessionRevision.initial()))
			written.push(event);

		expect(resolver.calls).toBe(1);
		expect(JSON.stringify(written)).toContain("model-1");
	});

	it("leaves calls that are not delegations alone", async () => {
		const declared = agent(SUPPORT, AgentDelegationPolicy.to([RESEARCHER]));
		const built = stack(declared);
		built.runner.uses(new AnsweringLoop());
		const opened = await openedSession(built.sessions);
		const scope = await built.scopes.create(
			contextOf(built.runs.start(SESSION, SUPPORT)),
			declared,
			MODEL,
			built.runs.start(SESSION, SUPPORT),
		);

		const answers = await built.runner.runAll(scope, opened, new RunProgress(opened.state), [
			new PendingCall(ToolCallId.from("c-1"), "lookup_order", {}),
		]);

		expect(answers.size).toBe(0);
	});

	it("refuses a target nobody declared, without writing anything", async () => {
		const declared = agent(SUPPORT);
		const built = stack(declared);
		built.runner.uses(new AnsweringLoop());
		const opened = await openedSession(built.sessions);
		const scope = await built.scopes.create(
			contextOf(built.runs.start(SESSION, SUPPORT)),
			declared,
			MODEL,
			built.runs.start(SESSION, SUPPORT),
		);

		await expect(
			built.runner.runAll(scope, opened, new RunProgress(opened.state), [delegateCall("researcher")]),
		).rejects.toBeInstanceOf(DelegationNotDeclaredError);
		expect((await built.storage.findOrFail(SessionContext.fromSessionId(SESSION))).revision.value).toBe(0);
	});

	it("opens the child one level deeper than whoever asked", async () => {
		const declared = agent(SUPPORT, AgentDelegationPolicy.to([RESEARCHER]));
		const built = stack(declared);
		const loop = new AnsweringLoop();
		built.runner.uses(loop);
		const opened = await openedSession(built.sessions);
		const scope = await built.scopes.create(
			contextOf(built.runs.start(SESSION, SUPPORT)),
			declared,
			MODEL,
			built.runs.start(SESSION, SUPPORT),
		);

		await built.runner.runAll(scope, opened, new RunProgress(opened.state), [delegateCall("researcher")]);

		expect(loop.depths).toEqual([1]);
	});

	it("refuses to go deeper than the maximum, before a child run exists", async () => {
		const declared = agent(SUPPORT, AgentDelegationPolicy.to([RESEARCHER]));
		const built = stack(declared);
		built.runner.uses(new AnsweringLoop());
		const opened = await openedSession(built.sessions);
		const started = built.runs.start(SESSION, SUPPORT);
		let scope = await built.scopes.create(contextOf(started), declared, MODEL, started);
		for (let level = 0; level < 3; level += 1) {
			const child = built.runs.delegate(scope.started, SUPPORT, CorrelationId.from(`c-${level}`));
			scope = await built.scopes.delegated(scope, child, declared, MODEL);
		}

		await expect(
			built.runner.runAll(scope, opened, new RunProgress(opened.state), [delegateCall("researcher")]),
		).rejects.toBeInstanceOf(AgentMaxDelegationDepthError);
	});

	it("says so when nobody gave it a loop to run turns with", async () => {
		const declared = agent(SUPPORT, AgentDelegationPolicy.to([RESEARCHER]));
		const built = stack(declared);
		const opened = await openedSession(built.sessions);
		const scope = await built.scopes.create(
			contextOf(built.runs.start(SESSION, SUPPORT)),
			declared,
			MODEL,
			built.runs.start(SESSION, SUPPORT),
		);

		await expect(
			built.runner.runAll(scope, opened, new RunProgress(opened.state), [delegateCall("researcher")]),
		).rejects.toBeInstanceOf(DelegationUnboundError);
	});
});
