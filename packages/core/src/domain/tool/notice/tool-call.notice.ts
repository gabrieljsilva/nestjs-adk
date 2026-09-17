import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { PendingCall } from "../../session/approval/pending-call.value-object";
import type { ToolEffect } from "../approval/tool-effect.value-object";
import type { ToolDefinition } from "../tool-definition.value-object";

/**
 * What an observer is told about one call the model asked for, before it runs. `tool` is absent
 * for a name no catalog knows, and `isHeld` is the gate's own verdict rather than a second opinion.
 */
export class ToolCallNotice {
	private constructor(
		public readonly callId: ToolCallId,
		public readonly toolName: string,
		public readonly args: Readonly<Record<string, unknown>>,
		public readonly isHeld: boolean,
		public readonly tool?: ToolDefinition,
	) {}

	public static fromCall(call: PendingCall, tool?: ToolDefinition): ToolCallNotice {
		return new ToolCallNotice(call.callId, call.toolName, { ...call.args }, call.isHeld, tool);
	}

	public get effect(): ToolEffect | undefined {
		return this.tool?.effect;
	}

	public get isKnown(): boolean {
		return this.tool !== undefined;
	}

	public get isInternal(): boolean {
		return this.tool?.internal === true;
	}
}
