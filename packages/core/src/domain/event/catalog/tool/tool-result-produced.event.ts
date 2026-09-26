import type { ArtifactId } from "../../../../common/identity/artifact-id.value-object";
import type { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import type { AttachmentReference } from "../../../model/attachment/attachment-reference.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

const SCHEMA_VERSION = 6;

/**
 * One tool call finished and produced an output, successful or failed.
 *
 * `output` is what the model reads back, a placeholder when the result was offloaded to
 * the artifact named by `artifactId`. `attachments` is what the tool meant to be looked at.
 */
export class ToolResultProduced extends SessionEvent {
	public readonly type = ToolResultProduced.TYPE;
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	public static readonly TYPE = "tool.result-produced";

	public constructor(
		header: EventHeader,
		public readonly callId: ToolCallId,
		public readonly toolName: string,
		public readonly output: Record<string, unknown>,
		public readonly failed: boolean,
		public readonly artifactId?: ArtifactId,
		public readonly attachments: readonly AttachmentReference[] = [],
	) {
		super(header.id, header.occurredAt, header.correlation);
	}

	public get wasOffloaded(): boolean {
		return this.artifactId !== undefined;
	}

	public get hasAttachments(): boolean {
		return this.attachments.length > 0;
	}
}
