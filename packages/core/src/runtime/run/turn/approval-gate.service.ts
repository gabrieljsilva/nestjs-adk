import type { ToolCall } from "../../../domain/model/messages/tool-call.value-object";
import { PendingCall } from "../../../domain/session/approval/pending-call.value-object";
import type { Actor } from "../../../domain/tool/access/actor.value-object";
import { AdkApprovalPolicy } from "../../../domain/tool/approval/adk-approval.policy";
import { EffectApprovalPolicy } from "../../../domain/tool/approval/effect-approval.policy";
import { ToolInvocation } from "../../../domain/tool/invocation/tool-invocation.value-object";
import type { ToolCatalog } from "../../tool/tool-catalog.service";

export class ApprovalGate {
	public constructor(private readonly policy: AdkApprovalPolicy = EffectApprovalPolicy.never()) {}

	public screen(catalog: ToolCatalog, calls: readonly ToolCall[], actor?: Actor): readonly PendingCall[] {
		return calls.map(
			(call) => new PendingCall(call.callId, call.toolName, call.args, this.findRequiredEffect(catalog, call, actor)),
		);
	}

	public holdsAny(calls: readonly PendingCall[]): boolean {
		return calls.some((call) => call.isHeld);
	}

	private findRequiredEffect(catalog: ToolCatalog, call: ToolCall, actor?: Actor): string | undefined {
		if (!catalog.has(call.toolName)) return undefined;
		const tool = catalog.findOrFail(call.toolName);
		if (tool.internal) return undefined;
		const invocation = new ToolInvocation(call.callId, call.toolName, call.args);
		return this.policy.requires(tool, invocation, actor) ? tool.effect.name : undefined;
	}
}
