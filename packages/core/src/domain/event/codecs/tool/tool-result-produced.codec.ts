import { ArtifactId } from "../../../../common/identity/artifact-id.value-object";
import { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import type { AttachmentReference } from "../../../model/attachment/attachment-reference.value-object";
import { ToolResultProduced } from "../../catalog/tool/tool-result-produced.event";
import { InvalidEventPayloadError } from "../../errors/invalid-event-payload.error";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEventCodec } from "../../session-event.codec";
import { AttachmentReferenceCodec } from "../attachment-reference.codec";

const SCHEMA_VERSION = 5;

export class ToolResultProducedCodec extends SessionEventCodec<ToolResultProduced> {
	public readonly type = ToolResultProduced.TYPE;
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	private readonly attachments = new AttachmentReferenceCodec();

	public encode(event: ToolResultProduced): Record<string, unknown> {
		const payload: Record<string, unknown> = {
			callId: event.callId.value,
			toolName: event.toolName,
			output: event.output,
			failed: event.failed,
		};
		if (event.artifactId !== undefined) payload.artifactId = event.artifactId.value;
		if (event.hasAttachments) {
			payload.attachments = event.attachments.map((reference) => this.attachments.encode(reference));
		}
		return payload;
	}

	public decode(payload: Readonly<Record<string, unknown>>, header: EventHeader): ToolResultProduced {
		return new ToolResultProduced(
			header,
			ToolCallId.from(this.readText(payload, "callId")),
			this.readText(payload, "toolName"),
			this.readRecord(payload, "output"),
			this.readFailedFlag(payload),
			this.readArtifactId(payload),
			this.readAttachments(payload),
		);
	}

	private readAttachments(payload: Readonly<Record<string, unknown>>): readonly AttachmentReference[] {
		const value = payload.attachments;
		if (value === undefined || value === null) return [];
		if (!Array.isArray(value)) throw new InvalidEventPayloadError(this.type, "attachments", "expected an array.");
		return value.map((entry) => {
			const reference = this.attachments.decode(entry);
			if (reference === undefined) {
				throw new InvalidEventPayloadError(this.type, "attachments", "expected an id or a link.");
			}
			return reference;
		});
	}

	private readArtifactId(payload: Readonly<Record<string, unknown>>): ArtifactId | undefined {
		const value = payload.artifactId;
		if (value === undefined) return undefined;
		if (typeof value !== "string") throw new InvalidEventPayloadError(this.type, "artifactId", "expected a string.");
		return ArtifactId.from(value);
	}

	private readFailedFlag(payload: Readonly<Record<string, unknown>>): boolean {
		const value = payload.failed;
		if (typeof value !== "boolean") throw new InvalidEventPayloadError(this.type, "failed", "expected a boolean.");
		return value;
	}
}
