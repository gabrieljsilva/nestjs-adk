import type { Session, SessionEvent, SessionInit } from "../types/events";

/**
 * Session persistence contract — the ONLY write path for history.
 * Mirrors the ADK's BaseSessionService so the adapter stays a thin bridge.
 * Implementations: InMemorySessionStore (default) | the user's Redis/Postgres/Prisma.
 */
export abstract class SessionStore {
	public abstract get(id: string): Promise<Session | null>;
	public abstract create(init: SessionInit): Promise<Session>;
	public abstract appendEvent(sessionId: string, event: SessionEvent): Promise<void>;
	/** Shallow merge of the stateDelta onto the state. */
	public abstract updateState(sessionId: string, delta: Record<string, unknown>): Promise<void>;
	public abstract delete(id: string): Promise<void>;
}
