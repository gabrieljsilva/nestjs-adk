import type { AgentResult } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { ConciergeAgent } from "../agents/concierge/concierge.agent";
import type { Attachment } from "./attachment";

@Injectable()
export class SendMessageUseCase {
	public constructor(private readonly concierge: ConciergeAgent) {}

	public execute(
		message: string,
		sessionId?: string,
		attachments: readonly Attachment[] = [],
		signal?: AbortSignal,
	): Promise<AgentResult> {
		const media = attachments.map((attachment) => attachment.toMediaPart());
		return this.concierge.ask(message, { sessionId, media, signal });
	}
}
