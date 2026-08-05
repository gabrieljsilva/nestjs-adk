import { describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage";
import { CorrelationId } from "../../common/identity/correlation-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { Instant } from "../../common/time/instant";
import { ModelResolver } from "../../contracts/model-resolver";
import { AgentDefinition } from "../../domain/agent/agent-definition";
import { AgentDelegationPolicy } from "../../domain/agent/agent-delegation-policy";
import { AgentDescription } from "../../domain/agent/agent-description";
import { AgentExecutionPolicies } from "../../domain/agent/agent-execution-policies";
import { AgentName } from "../../domain/agent/agent-name";
import { DeclaredAgent } from "../../domain/agent/declared-agent";
import { DelegationNotDeclaredError } from "../../domain/agent/errors/delegation-not-declared.error";
import type { LlmModel } from "../../domain/model/llm-model";
import { AgentMaxDelegationDepthError } from "../../domain/session/errors/agent-max-delegation-depth.error";
import { PendingCall } from "../../domain/session/pending-call";
import { Session } from "../../domain/session/session";
import { SessionMode } from "../../domain/session/session-mode";
import { SessionState } from "../../domain/session/session-state";
import { FakeClock } from "../../support/fake-clock";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { AgentCatalog } from "../catalog/agent-catalog";
import { ActiveRunTracker } from "../lifecycle/active-run-tracker";
import { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle";
import { ShutdownOptions } from "../lifecycle/shutdown-options";
import { AgentRunFactory } from "../run/agent-run-factory";
import { RunEventFactory } from "../run/run-event-factory";
import { RunJournal } from "../run/run-journal";
import { RunProgress } from "../run/run-progress";
import { RunScopeFactory } from "../run/run-scope-factory";
import { OpenedSession } from "../session/opened-session";
import { SessionManager } from "../session/session-manager";
import { DelegatedTurnLoop } from "./delegated-turn-loop";
import { DelegationRunner } from "./delegation-runner";
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

function stack(support: AgentDefinition) {
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
	const runner = new DelegationRunner(catalog, new FixedResolver(), runs, scopes, journal, sessions);
	return { storage, clock, sessions, runs, scopes, runner, support };
}

async function openedSession(sessions: SessionManager): Promise<OpenedSession> {
	const session = Session.start(SESSION, SUPPORT, SessionMode.EPHEMERAL, NOW);
	await sessions.create(session);
	return new OpenedSession(session, SessionState.initial(), true);
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
		const scope = built.scopes.create(declared, MODEL, started);

		const answers = await built.runner.runAll(scope, opened, new RunProgress(opened.state), [delegateCall("researcher")]);

		expect(answers.get("d-1")).toBe("the window is 30 days");
	});

	it("leaves calls that are not delegations alone", async () => {
		const declared = agent(SUPPORT, AgentDelegationPolicy.to([RESEARCHER]));
		const built = stack(declared);
		built.runner.uses(new AnsweringLoop());
		const opened = await openedSession(built.sessions);
		const scope = built.scopes.create(declared, MODEL, built.runs.start(SESSION, SUPPORT));

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
		const scope = built.scopes.create(declared, MODEL, built.runs.start(SESSION, SUPPORT));

		await expect(
			built.runner.runAll(scope, opened, new RunProgress(opened.state), [delegateCall("researcher")]),
		).rejects.toBeInstanceOf(DelegationNotDeclaredError);
		expect((await built.storage.findOrFail(SESSION)).revision.value).toBe(0);
	});

	it("opens the child one level deeper than whoever asked", async () => {
		const declared = agent(SUPPORT, AgentDelegationPolicy.to([RESEARCHER]));
		const built = stack(declared);
		const loop = new AnsweringLoop();
		built.runner.uses(loop);
		const opened = await openedSession(built.sessions);
		const scope = built.scopes.create(declared, MODEL, built.runs.start(SESSION, SUPPORT));

		await built.runner.runAll(scope, opened, new RunProgress(opened.state), [delegateCall("researcher")]);

		expect(loop.depths).toEqual([1]);
	});

	it("refuses to go deeper than the maximum, before a child run exists", async () => {
		const declared = agent(SUPPORT, AgentDelegationPolicy.to([RESEARCHER]));
		const built = stack(declared);
		built.runner.uses(new AnsweringLoop());
		const opened = await openedSession(built.sessions);
		const started = built.runs.start(SESSION, SUPPORT);
		let scope = built.scopes.create(declared, MODEL, started);
		for (let level = 0; level < 3; level += 1) {
			const child = built.runs.delegate(scope.started, SUPPORT, CorrelationId.from(`c-${level}`));
			scope = built.scopes.delegated(scope, child, declared, MODEL);
		}

		await expect(
			built.runner.runAll(scope, opened, new RunProgress(opened.state), [delegateCall("researcher")]),
		).rejects.toBeInstanceOf(AgentMaxDelegationDepthError);
	});

	it("says so when nobody gave it a loop to run turns with", async () => {
		const declared = agent(SUPPORT, AgentDelegationPolicy.to([RESEARCHER]));
		const built = stack(declared);
		const opened = await openedSession(built.sessions);
		const scope = built.scopes.create(declared, MODEL, built.runs.start(SESSION, SUPPORT));

		await expect(
			built.runner.runAll(scope, opened, new RunProgress(opened.state), [delegateCall("researcher")]),
		).rejects.toBeInstanceOf(DelegationUnboundError);
	});
});
