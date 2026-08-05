import { ModelCapability } from "../../domain/model/model-capability";
import type { ModelDescriptor } from "../../domain/model/model-descriptor";
import type { ModelMessage } from "../../domain/model/model-message";
import { ModelRequest } from "../../domain/model/model-request";
import { UserMessage } from "../../domain/model/user-message";

/** What the model reads in place of an image it was never able to look at. */
const PLACEHOLDER = "[image attached: this model cannot see images]";

/**
 * Makes a request fit the model that is about to serve it, when history has images in it.
 *
 * An attachment is refused at the door when the agent's own model cannot see it, so the
 * only way one reaches here is that the turn is being served by a different model than the
 * turn that received it: a failover, a transfer, a delegation to a specialist. Ending the
 * conversation over that would punish the user for a routing decision they never made.
 *
 * So the words stay, the image is replaced by a line saying it was there, and the journal
 * is untouched. Coming back to a model that can see restores the image, because nothing
 * about the session was rewritten.
 */
export class MediaFit {
	public fit(request: ModelRequest, descriptor: ModelDescriptor): ModelRequest {
		if (!request.hasMedia) return request;
		if (descriptor.capabilities.supports(ModelCapability.MEDIA_INPUT)) return request;
		return new ModelRequest(
			request.messages.map((message) => this.without(message)),
			request.tools,
			request.instructions,
			request.outputSchema,
		);
	}

	private without(message: ModelMessage): ModelMessage {
		if (!(message instanceof UserMessage) || !message.hasMedia) return message;
		const notes = message.media.map(() => PLACEHOLDER).join("\n");
		return new UserMessage(`${message.text}\n\n${notes}`);
	}
}
