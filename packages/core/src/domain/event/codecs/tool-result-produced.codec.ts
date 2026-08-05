import { ArtifactId } from "../../../common/identity/artifact-id";
import { ToolCallId } from "../../../common/identity/tool-call-id";
import { ToolResultProduced } from "../catalog/tool-result-produced";
import { InvalidEventPayloadError } from "../errors/invalid-event-payload.error";
import type { EventHeader } from "../event-header";
import { EventSchemaVersion } from "../event-schema-version";
import { SessionEventCodec } from "../session-event-codec";

/** The version that started recording where an offloaded result went. */
const SCHEMA_VERSION = 2;

/** Codec for the outcome of one tool call, kept paired with its request by callId. */
export class ToolResultProducedCodec extends SessionEventCodec<ToolResultProduced> {
	public readonly type = ToolResultProduced.TYPE;
	public readonly schemaVersion = EventSchemaVersion.of(SCHEMA_VERSION);

	public encode(event: ToolResultProduced): Record<string, unknown> {
		const payload: Record<string, unknown> = {
			callId: event.callId.value,
			toolName: event.toolName,
			output: event.output,
			failed: event.failed,
		};
		// Absent rather than null: a result that fit in the context has no artifact at all.
		if (event.artifactId !== undefined) payload.artifactId = event.artifactId.value;
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
		);
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
