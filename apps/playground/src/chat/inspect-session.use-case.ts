import type { SessionInspection } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { ConciergeAgent } from "../agents/concierge.agent";

/** Where a conversation stands, for a screen that reloaded or a process that did not run it. */
@Injectable()
export class InspectSessionUseCase {
	public constructor(private readonly concierge: ConciergeAgent) {}

	public execute(sessionId: string): Promise<SessionInspection> {
		return this.concierge.inspect(sessionId);
	}
}
