import {
	AppendEventsCommand,
	type AppendEventsResult,
	InMemorySessionStorage,
	type SessionContext,
	SessionEventBatch,
} from "@nestjs-adk/core";

/**
 * Breaks atomicity by persisting only the first event of a multi event batch: a command lands half applied and the
 * journal stops explaining the state, so a replay rebuilds a session that never existed.
 */
export class NonAtomicSessionStorage extends InMemorySessionStorage {
	public override async append(context: SessionContext, command: AppendEventsCommand): Promise<AppendEventsResult> {
		const first = command.batch.events[0];
		if (command.batch.size <= 1 || first === undefined) return super.append(context, command);
		return super.append(
			context,
			new AppendEventsCommand(command.sessionId, command.expectedRevision, new SessionEventBatch([first])),
		);
	}
}
