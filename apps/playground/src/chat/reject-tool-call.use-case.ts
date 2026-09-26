import { type AgentResult, ToolCallId } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { ConciergeAgent } from "../agents/concierge/concierge.agent";

@Injectable()
export class RejectToolCallUseCase {
	public constructor(private readonly concierge: ConciergeAgent) {}

	public execute(sessionId: string, callId: string, reason: string, deniedBy: string): Promise<AgentResult> {
		return this.concierge.reject(sessionId, ToolCallId.from(callId), reason, deniedBy);
	}
}
