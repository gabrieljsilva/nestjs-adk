import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { PendingCall } from "../../session/approval/pending-call.value-object";
import type { ToolEffect } from "../approval/tool-effect.value-object";
import type { ToolDefinition } from "../tool-definition.value-object";

/**
 * What an observer is told about one call the model asked for, before it runs.
 *
 * It is the call as the gate screened it, with the tool it named beside it. The tool
 * travels here because it is what an interface renders and what a policy would judge:
 * its declared effect, whether the runtime owns it, and the description it was declared
 * with. A call to a tool nobody declared has none, and says so instead of guessing.
 *
 * `isHeld` is the gate's verdict and never a second opinion: the policy that decided it
 * was asked once, inside the run, and what the observer reads is that answer.
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

	/** The effect the tool declared, and nothing for a tool the catalog does not know. */
	public get effect(): ToolEffect | undefined {
		return this.tool?.effect;
	}

	public get isKnown(): boolean {
		return this.tool !== undefined;
	}

	/** True for a tool the runtime offers on its own behalf, which nobody asked for by name. */
	public get isInternal(): boolean {
		return this.tool?.internal === true;
	}
}
