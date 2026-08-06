import { type AgentResult, ToolCallId } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { ConciergeAgent } from "../agents/concierge.agent";

/**
 * The human saying no, with the reason the run reads back.
 *
 * A refusal is not a failure: the reason reaches the model as the result of the call, and
 * the conversation carries on from there.
 */
@Injectable()
export class RejectToolCallUseCase {
	public constructor(private readonly concierge: ConciergeAgent) {}

	public execute(sessionId: string, callId: string, reason: string, deniedBy: string): Promise<AgentResult> {
		return this.concierge.reject(sessionId, ToolCallId.from(callId), reason, deniedBy);
	}
}
