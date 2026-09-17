import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { ArtifactReference } from "../../artifact/artifact-reference.value-object";
import type { AttachmentReference } from "../../model/attachment/attachment-reference.value-object";

/**
 * What one tool call produced. `output` is the record the journal keeps; `contextOutput` is what
 * the model reads, and the two differ when the result was offloaded to an artifact. A failure is
 * an outcome here and never a thrown error.
 */
export class ToolOutcome {
	private constructor(
		public readonly callId: ToolCallId,
		public readonly toolName: string,
		public readonly output: Record<string, unknown>,
		public readonly contextOutput: string,
		public readonly failed: boolean,
		public readonly reference?: ArtifactReference,
		public readonly attachments: readonly AttachmentReference[] = [],
	) {}

	public static succeeded(
		callId: ToolCallId,
		toolName: string,
		output: Record<string, unknown>,
		contextOutput: string,
		reference?: ArtifactReference,
		attachments: readonly AttachmentReference[] = [],
	): ToolOutcome {
		return new ToolOutcome(callId, toolName, output, contextOutput, false, reference, [...attachments]);
	}

	public static failed(callId: ToolCallId, toolName: string, reason: string): ToolOutcome {
		return new ToolOutcome(callId, toolName, { error: reason }, reason, true);
	}

	public static refused(callId: ToolCallId, toolName: string, reason: string): ToolOutcome {
		return new ToolOutcome(callId, toolName, { refused: true, reason }, reason, true);
	}

	public get wasOffloaded(): boolean {
		return this.reference !== undefined;
	}

	public get recordedOutput(): Record<string, unknown> {
		const reference = this.reference;
		if (reference === undefined) return this.output;
		return {
			artifactId: reference.id.value,
			mediaType: reference.mediaType,
			characters: reference.characters,
			value: this.contextOutput,
		};
	}
}
