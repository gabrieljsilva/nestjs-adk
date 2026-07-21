import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { SessionStore } from "../abstracts/session-store";
import { SessionNotFoundError } from "../errors/runtime.errors";
import type { Session, SessionEvent, SessionInit } from "../types/events";

export interface AppendSliceInput {
	type: string;
	data: Record<string, unknown>;
	author?: SessionEvent["author"];
}

/**
 * Public session API outside the user's turn.
 * `append` injects an event WITHOUT triggering a run — e.g.: "order #123 shipped" lands in the
 * chat before the next question. Operates on the module's default SessionStore.
 */
@Injectable()
export class AgentSessions {
	public constructor(private readonly store: SessionStore) {}

	public get(id: string): Promise<Session | null> {
		return this.store.get(id);
	}

	public create(init: SessionInit = {}): Promise<Session> {
		return this.store.create(init);
	}

	public async append(sessionId: string, input: AppendSliceInput): Promise<SessionEvent> {
		const session = await this.store.get(sessionId);
		if (!session) throw new SessionNotFoundError(sessionId);

		const event: SessionEvent = {
			v: 1,
			id: randomUUID(),
			at: Date.now(),
			author: input.author ?? "system",
			type: input.type,
			data: input.data,
		};
		await this.store.appendEvent(sessionId, event);
		return event;
	}

	public delete(id: string): Promise<void> {
		return this.store.delete(id);
	}
}
