import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { ToolOutcome } from "../invocation/tool-outcome.value-object";
import type { ToolDefinition } from "../tool-definition.value-object";

/** What an observer is told once a call it heard about has an answer. `tool` is absent for a name no catalog knows. */
export class ToolResultNotice {
	public constructor(
		public readonly outcome: ToolOutcome,
		public readonly tool?: ToolDefinition,
	) {}

	public get callId(): ToolCallId {
		return this.outcome.callId;
	}

	public get toolName(): string {
		return this.outcome.toolName;
	}

	public get output(): Readonly<Record<string, unknown>> {
		return this.outcome.recordedOutput;
	}

	public get failed(): boolean {
		return this.outcome.failed;
	}

	public get isRefused(): boolean {
		return this.outcome.failed && this.outcome.output.refused === true;
	}

	public get reason(): string | undefined {
		return this.outcome.failed ? this.outcome.contextOutput : undefined;
	}
}
