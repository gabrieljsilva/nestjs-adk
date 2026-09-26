import { type AgentResult, ToolCallId } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { ConciergeAgent } from "../agents/concierge/concierge.agent";

@Injectable()
export class ApproveToolCallUseCase {
	public constructor(private readonly concierge: ConciergeAgent) {}

	public execute(sessionId: string, callId: string, approvedBy: string): Promise<AgentResult> {
		return this.concierge.approve(sessionId, ToolCallId.from(callId), approvedBy);
	}
}
