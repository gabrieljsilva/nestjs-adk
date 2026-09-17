import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { ToolOutcome } from "../invocation/tool-outcome.value-object";
import type { ToolDefinition } from "../tool-definition.value-object";

/**
 * What an observer is told once a call it heard about has an answer.
 *
 * The outcome is the one the journal records, whole: a result, a failure, or a refusal
 * somebody made. The tool is beside it for the same reason it is beside the request, so
 * an observer that renders tool calls does not have to remember what it was told earlier.
 */
export class ToolResultNotice {
	private constructor(
		public readonly outcome: ToolOutcome,
		public readonly tool?: ToolDefinition,
	) {}

	public static of(outcome: ToolOutcome, tool?: ToolDefinition): ToolResultNotice {
		return new ToolResultNotice(outcome, tool);
	}

	public get callId(): ToolCallId {
		return this.outcome.callId;
	}

	public get toolName(): string {
		return this.outcome.toolName;
	}

	/** The record the journal keeps, which for an offloaded result is the placeholder and the reference. */
	public get output(): Readonly<Record<string, unknown>> {
		return this.outcome.recordedOutput;
	}

	public get failed(): boolean {
		return this.outcome.failed;
	}

	/** A failure somebody chose: the person asked, or the access policy. The model is told apart from an error. */
	public get isRefused(): boolean {
		return this.outcome.failed && this.outcome.output.refused === true;
	}

	/** The reason a failed or refused call gives, as the model reads it. */
	public get reason(): string | undefined {
		return this.outcome.failed ? this.outcome.contextOutput : undefined;
	}

	public get isInternal(): boolean {
		return this.tool?.internal === true;
	}
}
