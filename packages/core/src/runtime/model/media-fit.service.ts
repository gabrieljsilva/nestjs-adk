import { ModelCapability } from "../../domain/model/descriptor/model-capability.value-object";
import type { ModelDescriptor } from "../../domain/model/descriptor/model-descriptor.value-object";
import type { ModelMessage } from "../../domain/model/messages/model-message.value-object";
import { UserMessage } from "../../domain/model/messages/user-message.value-object";
import { ModelRequest } from "../../domain/model/model-request.value-object";

const PLACEHOLDER = "[image attached: this model cannot see images]";

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
