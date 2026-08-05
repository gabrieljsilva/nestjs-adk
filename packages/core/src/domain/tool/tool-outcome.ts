import type { ArtifactId } from "../../common/identity/artifact-id";
import type { ToolCallId } from "../../common/identity/tool-call-id";
import type { ArtifactReference } from "../artifact/artifact-reference";

/**
 * What one tool call produced, in the two forms it has to exist in.
 *
 * `output` is canonical: the record the journal keeps and the application can read back
 * whole. `contextOutput` is what the model reads, and the two differ exactly when the
 * result was too large to sit in a context, in which case the model gets a placeholder
 * and the reference to fetch the rest.
 *
 * A failure is an outcome and not an exception. The model asked for the call, so being
 * told the call failed is information it can act on, and hiding it behind a thrown error
 * would leave the run unable to explain itself.
 */
export class ToolOutcome {
	private constructor(
		public readonly callId: ToolCallId,
		public readonly toolName: string,
		public readonly output: Record<string, unknown>,
		public readonly contextOutput: string,
		public readonly failed: boolean,
		public readonly reference?: ArtifactReference,
		/** Ids of what the tool produced to be looked at, stored the way an attachment is. */
		public readonly attachments: readonly ArtifactId[] = [],
	) {}

	public static succeeded(
		callId: ToolCallId,
		toolName: string,
		output: Record<string, unknown>,
		contextOutput: string,
		reference?: ArtifactReference,
		attachments: readonly ArtifactId[] = [],
	): ToolOutcome {
		return new ToolOutcome(callId, toolName, output, contextOutput, false, reference, [...attachments]);
	}

	/** The reason travels as text because its reader is the model, not a log. */
	public static failed(callId: ToolCallId, toolName: string, reason: string): ToolOutcome {
		return new ToolOutcome(callId, toolName, { error: reason }, reason, true);
	}

	public get hasAttachments(): boolean {
		return this.attachments.length > 0;
	}

	public get wasOffloaded(): boolean {
		return this.reference !== undefined;
	}

	/**
	 * The record that goes into the journal and, through it, into the next prompt.
	 *
	 * An offloaded result is recorded as the placeholder and the id, never as the content:
	 * writing the whole thing down would put back into the context exactly what offloading
	 * took out of it, and the content is already durable in the artifact it was moved to.
	 */
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
