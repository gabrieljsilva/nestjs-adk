import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { ArtifactReference } from "../../artifact/artifact-reference.value-object";
import type { AttachmentReference } from "../../model/attachment/attachment-reference.value-object";

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
		/** What the tool produced to be looked at, named the way any attachment is. */
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

	/** The reason travels as text because its reader is the model, not a log. */
	public static failed(callId: ToolCallId, toolName: string, reason: string): ToolOutcome {
		return new ToolOutcome(callId, toolName, { error: reason }, reason, true);
	}

	/**
	 * A call that did not run because somebody said no: the person who was asked, or the
	 * access policy. It is still a failed result, so the model does not ask again, but it
	 * says `refused` and not `error`, because a model told of an error explains a fault
	 * and retries, and a model told of a refusal says so and moves on. The key is a
	 * boolean so that the vocabulary is the same in every language the reason is written in.
	 */
	public static refused(callId: ToolCallId, toolName: string, reason: string): ToolOutcome {
		return new ToolOutcome(callId, toolName, { refused: true, reason }, reason, true);
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
