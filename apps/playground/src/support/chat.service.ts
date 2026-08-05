import type { RunResult } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { SupportAgent } from "./support.agent";

/** Idiomatic consumption: the agent instance IS the handle, plain Nest DI. */
@Injectable()
export class ChatService {
	constructor(private readonly support: SupportAgent) {}

	public send(sessionId: string, userId: string, message: string): Promise<RunResult> {
		return this.support.ask({ sessionId, userId, message });
	}

	public approve(sessionId: string, callId: string): Promise<RunResult> {
		return this.support.approve({ sessionId, callId });
	}
}
