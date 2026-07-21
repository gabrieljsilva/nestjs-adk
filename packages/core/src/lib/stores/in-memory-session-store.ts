import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { SessionStore } from "../abstracts/session-store";
import { SessionNotFoundError } from "../errors/runtime.errors";
import type { Session, SessionEvent, SessionInit } from "../types/events";

/** Module default. Copy on read: mutating the return value doesn't corrupt the store. */
@Injectable()
export class InMemorySessionStore extends SessionStore {
	private readonly sessions = new Map<string, Session>();

	public async get(id: string): Promise<Session | null> {
		const session = this.sessions.get(id);
		return session ? structuredClone(session) : null;
	}

	public async create(init: SessionInit): Promise<Session> {
		const now = new Date();
		const session: Session = {
			id: init.id ?? randomUUID(),
			userId: init.userId,
			state: structuredClone(init.state ?? {}),
			events: [],
			createdAt: now,
			updatedAt: now,
		};
		this.sessions.set(session.id, session);
		return structuredClone(session);
	}

	public async appendEvent(sessionId: string, event: SessionEvent): Promise<void> {
		const session = this.require(sessionId);
		session.events.push(structuredClone(event));
		session.updatedAt = new Date();
	}

	public async updateState(sessionId: string, delta: Record<string, unknown>): Promise<void> {
		const session = this.require(sessionId);
		session.state = { ...session.state, ...structuredClone(delta) };
		session.updatedAt = new Date();
	}

	public async delete(id: string): Promise<void> {
		this.sessions.delete(id);
	}

	private require(sessionId: string): Session {
		const session = this.sessions.get(sessionId);
		if (!session) throw new SessionNotFoundError(sessionId);
		return session;
	}
}
