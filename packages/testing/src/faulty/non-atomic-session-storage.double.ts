import {
	AppendEventsCommand,
	type AppendEventsResult,
	InMemorySessionStorage,
	type SessionContext,
	SessionEventBatch,
} from "@nestjs-adk/core";

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
