import type { ArtifactId } from "../../../../common/identity/artifact-id.value-object";
import type { ToolCallId } from "../../../../common/identity/tool-call-id.value-object";
import type { AttachmentReference } from "../../../model/attachment/attachment-reference.value-object";
import type { EventHeader } from "../../event-header.value-object";
import { EventSchemaVersion } from "../../event-schema-version.value-object";
import { SessionEvent } from "../../session-event.event";

/** The version that started recording an external attachment, resolved by the application. */
const SCHEMA_VERSION = 5;

/**
 * One tool call finished and produced an output, successful or failed.
 *
 * The output is what the model reads back. When the result was too large for a context it
 * is the placeholder, and the artifact holds the content: the id travels here so anything
 * reading the journal can still reach what the placeholder stands for.
 *
 * `attachments` is a different thing from `artifactId`. The first is what the tool meant
 * to be looked at, and the second is where its text went when it did not fit.
 */
export class ToolResultProduced extends SessionEvent {
	public readonly type = ToolResultProduced.TYPE;
	public readonly schemaVersion = new EventSchemaVersion(SCHEMA_VERSION);

	public static readonly TYPE = "tool.result-produced";

	public constructor(
		header: EventHeader,
		// The call/result pair shares one callId: that is what preserves causality in the context.
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
