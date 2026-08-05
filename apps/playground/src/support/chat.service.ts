import { AgentRegistry, type AgentResult, SessionId, ToolCallId } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";

/**
 * What an application actually writes: inject the registry, hold a handle, ask.
 * Nothing here knows the runtime exists, which is the point of the handle.
 */
@Injectable()
export class ChatService {
	public constructor(private readonly agents: AgentRegistry) {}

	public send(message: string, sessionId?: string): Promise<AgentResult> {
		return this.support.ask(message, sessionId === undefined ? undefined : SessionId.from(sessionId));
	}

	public approve(sessionId: string, callId: string): Promise<AgentResult> {
		return this.support.approve(SessionId.from(sessionId), ToolCallId.from(callId));
	}

	public reject(sessionId: string, callId: string, reason: string): Promise<AgentResult> {
		return this.support.reject(SessionId.from(sessionId), ToolCallId.from(callId), reason);
	}

	private get support() {
		return this.agents.get("support");
	}
}
