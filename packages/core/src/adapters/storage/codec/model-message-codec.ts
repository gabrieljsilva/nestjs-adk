import { ToolCallId } from "../../../common/identity/tool-call-id";
import { AssistantMessage } from "../../../domain/model/assistant-message";
import { MediaLimits } from "../../../domain/model/media-limits";
import { MediaPart } from "../../../domain/model/media-part";
import type { ModelMessage } from "../../../domain/model/model-message";
import { ToolCallMessage } from "../../../domain/model/tool-call-message";
import { ToolResultMessage } from "../../../domain/model/tool-result-message";
import { UserMessage } from "../../../domain/model/user-message";
import { UnreadableStoredValueError } from "./errors/unreadable-stored-value.error";
import { StoredRow } from "./stored-row";

/**
 * Turns one message of a context into a payload and back.
 *
 * The role is the discriminator and the subclass is what matters: provider adapters
 * translate by type, so a tool call read back as prose loses the id its result is tied to
 * and the signature the provider wants to see again.
 *
 * The limits are the ones an image is checked against on the way back. They are declared
 * rather than assumed because an application that widened them and then stored something
 * larger would otherwise be unable to read its own checkpoint.
 */
export class ModelMessageCodec {
	public constructor(private readonly limits: MediaLimits = MediaLimits.byDefault()) {}

	public encode(message: ModelMessage): Record<string, unknown> {
		if (message instanceof UserMessage) {
			return { role: message.role, text: message.text, media: message.media.map((part) => this.encodeMedia(part)) };
		}
		if (message instanceof ToolCallMessage) {
			return {
				role: message.role,
				callId: message.callId.value,
				toolName: message.toolName,
				args: message.args,
				signature: message.signature,
			};
		}
		if (message instanceof ToolResultMessage) {
			return {
				role: message.role,
				callId: message.callId.value,
				toolName: message.toolName,
				output: message.output,
				failed: message.failed,
				media: message.media.map((part) => this.encodeMedia(part)),
			};
		}
		return { role: message.role, text: message.text };
	}

	public decode(values: unknown): ModelMessage {
		const row = new StoredRow(values);
		const role = row.text("role");
		if (role === "user") return new UserMessage(row.text("text"), this.decodeMedia(row.array("media")));
		if (role === "assistant") return new AssistantMessage(row.text("text"));
		if (role === "tool-call") {
			return new ToolCallMessage(
				ToolCallId.from(row.text("callId")),
				row.text("toolName"),
				row.json("args"),
				row.optionalText("signature"),
			);
		}
		if (role === "tool-result") {
			return new ToolResultMessage(
				ToolCallId.from(row.text("callId")),
				row.text("toolName"),
				row.json("output"),
				row.boolean("failed"),
				this.decodeMedia(row.array("media")),
			);
		}
		throw new UnreadableStoredValueError("role", role);
	}

	/** A link keeps being a link: fetching the bytes to store them would defeat the point of one. */
	private encodeMedia(part: MediaPart): Record<string, unknown> {
		if (part.isRemote) return { mediaType: part.mediaType, url: part.url };
		return { mediaType: part.mediaType, base64: part.base64 };
	}

	private decodeMedia(values: readonly unknown[]): readonly MediaPart[] {
		return values.map((value) => {
			const row = new StoredRow(value);
			const url = row.optionalText("url");
			if (url !== undefined) return MediaPart.link(url, row.text("mediaType"), this.limits);
			return MediaPart.image(row.text("mediaType"), row.text("base64"), this.limits);
		});
	}
}
