import { type AgentResult, MediaPart, ToolCallId } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { SupportAgent } from "./support.agent";

/**
 * What an application actually writes: inject the agent and ask it something.
 *
 * The agent class is a provider like any other, so nothing here looks a name up and
 * nothing here knows the runtime exists. `AgentRegistry` is the other way in, for a
 * service that needs an agent it cannot import.
 */
@Injectable()
export class ChatService {
	public constructor(private readonly support: SupportAgent) {}

	public send(message: string, sessionId?: string): Promise<AgentResult> {
		return this.support.ask(message, { sessionId });
	}

	/** An image the user uploaded, sent as bytes or as the URL it was uploaded to. */
	public sendImage(message: string, image: string, mediaType: string, sessionId?: string): Promise<AgentResult> {
		const media = image.startsWith("http") ? MediaPart.link(image, mediaType) : MediaPart.image(mediaType, image);
		return this.support.ask(message, { sessionId, media: [media] });
	}

	public approve(sessionId: string, callId: string): Promise<AgentResult> {
		return this.support.approve(sessionId, ToolCallId.from(callId));
	}

	public reject(sessionId: string, callId: string, reason: string): Promise<AgentResult> {
		return this.support.reject(sessionId, ToolCallId.from(callId), reason);
	}
}
