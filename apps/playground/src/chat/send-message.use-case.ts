import type { AgentResult } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";
import { ConciergeAgent } from "../agents/concierge/concierge.agent";
import type { Attachment } from "./attachment";

/**
 * What the application actually writes: inject the agent and ask it something.
 *
 * The agent class is a provider like any other, so nothing here looks a name up and
 * nothing here knows the runtime exists. Every conversation starts at the concierge,
 * which is what makes the sector the customer ends up in a decision of the store rather
 * than of whoever wrote the front end.
 */
@Injectable()
export class SendMessageUseCase {
	public constructor(private readonly concierge: ConciergeAgent) {}

	/**
	 * One question, and whatever came attached to it, in the order it was attached.
	 *
	 * The signal is the customer closing the tab or pressing stop. Passing it through is
	 * what makes that end the run instead of only ending the reading: a request that goes
	 * away without one leaves the provider generating an answer nobody will see, on the
	 * store's bill.
	 */
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
