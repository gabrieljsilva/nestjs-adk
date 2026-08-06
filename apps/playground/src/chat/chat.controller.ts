import type { AgentResult, SessionInspection } from "@nestjs-adk/core";
import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApproveToolCallUseCase } from "./approve-tool-call.use-case";
import { Attachment } from "./attachment";
import { InspectSessionUseCase } from "./inspect-session.use-case";
import { RejectToolCallUseCase } from "./reject-tool-call.use-case";
import { SendMessageUseCase } from "./send-message.use-case";

/**
 * The conversation over HTTP.
 *
 * Four routes, and every one of them is one line: say something, decide on a call that is
 * waiting, and read where the conversation stands. The session id comes back from the
 * first answer and is sent on every message after it, which is how a stateless request
 * continues a stateful conversation.
 *
 * The attachments are the one thing read rather than passed on: a body says whatever the
 * caller typed, so it becomes `Attachment` here or the request fails here.
 */
@Controller("chat")
export class ChatController {
	public constructor(
		private readonly sendMessageUseCase: SendMessageUseCase,
		private readonly approveToolCallUseCase: ApproveToolCallUseCase,
		private readonly rejectToolCallUseCase: RejectToolCallUseCase,
		private readonly inspectSessionUseCase: InspectSessionUseCase,
	) {}

	@Post("messages")
	public send(
		@Body("message") message: string,
		@Body("sessionId") sessionId?: string,
		@Body("attachments") attachments?: unknown,
	): Promise<AgentResult> {
		return this.sendMessageUseCase.execute(message, sessionId, Attachment.listFrom(attachments));
	}

	@Post("approvals")
	public approve(
		@Body("sessionId") sessionId: string,
		@Body("callId") callId: string,
		@Body("approvedBy") approvedBy: string,
	): Promise<AgentResult> {
		return this.approveToolCallUseCase.execute(sessionId, callId, approvedBy);
	}

	@Post("rejections")
	public reject(
		@Body("sessionId") sessionId: string,
		@Body("callId") callId: string,
		@Body("reason") reason: string,
		@Body("deniedBy") deniedBy: string,
	): Promise<AgentResult> {
		return this.rejectToolCallUseCase.execute(sessionId, callId, reason, deniedBy);
	}

	@Get("sessions/:id")
	public session(@Param("id") id: string): Promise<SessionInspection> {
		return this.inspectSessionUseCase.execute(id);
	}
}
