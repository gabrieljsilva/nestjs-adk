import { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import { CorrelationId } from "../../common/identity/correlation-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { Instant } from "../../common/time/instant.value-object";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { RunContext } from "../../domain/run/run-context.value-object";
import { SessionContext } from "../../domain/run/session-context.value-object";
import type { SessionMetadata } from "../../domain/session/metadata/session-metadata.value-object";
import { AgentRun } from "../../domain/session/run/agent-run.entity";
import { Session } from "../../domain/session/session.entity";
import { SessionState } from "../../domain/session/state/session-state.value-object";
import type { Actor } from "../../domain/tool/access/actor.value-object";

const START = Instant.fromIso("2026-01-01T00:00:00.000Z");

/**
 * The contexts a spec needs, built the one way production builds them.
 *
 * Every port takes a context now, so a suite that assembled one by hand would be asserting
 * against a shape nothing else produces. These go through the same factories a run goes
 * through, which is what keeps a passing spec evidence about the real thing.
 */
export class RunContextFixture {
	public static readonly AGENT = AgentName.from("support");

	public static session(sessionId: string | SessionId, metadata?: SessionMetadata): SessionContext {
		const id = typeof sessionId === "string" ? SessionId.from(sessionId) : sessionId;
		return metadata === undefined ? SessionContext.fromSessionId(id) : new SessionContext(id, metadata);
	}

	public static run(
		sessionId: string | SessionId = "s-1",
		options: {
			readonly agent?: AgentName;
			readonly runId?: string;
			readonly metadata?: SessionMetadata;
			readonly actor?: Actor;
			readonly signal?: AbortSignal;
		} = {},
	): RunContext {
		const id = typeof sessionId === "string" ? SessionId.from(sessionId) : sessionId;
		const agent = options.agent ?? RunContextFixture.AGENT;
		const session = Session.start(id, agent, START);
		const state = SessionState.initial();
		const run = AgentRun.start(AgentRunId.from(options.runId ?? "run-1"), id, agent, START, CorrelationId.from("corr-1"));
		const context = RunContext.fromOpenedSession(session, state, run, {
			actor: options.actor,
			signal: options.signal,
		});
		return options.metadata === undefined ? context : context.withMetadata(options.metadata);
	}
}
