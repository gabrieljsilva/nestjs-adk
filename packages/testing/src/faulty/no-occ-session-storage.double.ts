import {
	AppendEventsCommand,
	type AppendEventsResult,
	InMemorySessionStorage,
	type SessionContext,
} from "@nestjs-adk/core";

export class NoOccSessionStorage extends InMemorySessionStorage {
	public override async append(context: SessionContext, command: AppendEventsCommand): Promise<AppendEventsResult> {
		const session = await this.findOrFail(context);
		return super.append(context, new AppendEventsCommand(command.sessionId, session.revision, command.batch));
	}
}
