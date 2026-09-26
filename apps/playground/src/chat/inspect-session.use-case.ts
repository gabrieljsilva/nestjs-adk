import type { SessionInspection } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { ConciergeAgent } from "../agents/concierge/concierge.agent";

@Injectable()
export class InspectSessionUseCase {
	public constructor(private readonly concierge: ConciergeAgent) {}

	public execute(sessionId: string): Promise<SessionInspection> {
		return this.concierge.inspect(sessionId);
	}
}
