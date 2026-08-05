import type { Session, SessionEvent, SessionInit } from "../types/events";

/**
 * How to read a session. It exists because an app whose message table predates the agent persists
 * the user's turn BEFORE the run starts: the history would then already carry the message the run
 * is about to send, and the model would see the question twice.
 */
export interface SessionReadOptions {
	/**
	 * Event to leave out of `events`. The caller re-supplies it as `RunInput.message`, so the store
	 * excludes it by id, never by position, or two concurrent turns on the same session would each
	 * drop the other's message.
	 */
	excludeEventId?: string;
}

/**
 * Session persistence contract: the ONLY write path for history.
 * Mirrors the ADK's BaseSessionService so the adapter stays a thin bridge.
 * Implementations: InMemorySessionStore (default) | the user's Redis/Postgres/Prisma.
 */
export abstract class SessionStore {
	public abstract get(id: string, options?: SessionReadOptions): Promise<Session | null>;
	public abstract create(init: SessionInit): Promise<Session>;
	public abstract appendEvent(sessionId: string, event: SessionEvent): Promise<void>;
	/** Shallow merge of the stateDelta onto the state. */
	public abstract updateState(sessionId: string, delta: Record<string, unknown>): Promise<void>;
	public abstract delete(id: string): Promise<void>;
}
