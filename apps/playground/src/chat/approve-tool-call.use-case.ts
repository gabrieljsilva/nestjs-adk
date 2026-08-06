import { type AgentResult, ToolCallId } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { ConciergeAgent } from "../agents/concierge.agent";

/**
 * The human saying yes to a tool that was waiting for one.
 *
 * The decision is taken on the session and the call, never on the agent, so the answer
 * reaches the run whichever sector was holding the conversation when it stopped.
 */
@Injectable()
export class ApproveToolCallUseCase {
	public constructor(private readonly concierge: ConciergeAgent) {}

	public execute(sessionId: string, callId: string, approvedBy: string): Promise<AgentResult> {
		return this.concierge.approve(sessionId, ToolCallId.from(callId), approvedBy);
	}
}
