import type { ToolCall } from "../../domain/model/tool-call";
import { PendingCall } from "../../domain/session/pending-call";
import { AdkApprovalPolicy } from "../../domain/tool/adk-approval-policy";
import { EffectApprovalPolicy } from "../../domain/tool/effect-approval-policy";
import { ToolInvocation } from "../../domain/tool/tool-invocation";
import type { ToolCatalog } from "../tool/tool-catalog";

/**
 * Reads a turn and says which of its calls somebody has to answer for.
 *
 * It answers about the turn and never about one call, because the turn is what stops. A
 * turn that mixes a lookup with a refund does not half happen: either the whole thing
 * runs or none of it does, and whoever decides is shown all of it rather than the first
 * piece of it.
 *
 * A call it holds carries the effect that held it. That is what a person reads before
 * answering, and what a process that restarted needs to show them again.
 */
export class ApprovalGate {
	public constructor(private readonly policy: AdkApprovalPolicy = EffectApprovalPolicy.never()) {}

	/** The whole turn as the journal will hold it, with an effect on each held call. */
	public screen(catalog: ToolCatalog, calls: readonly ToolCall[]): readonly PendingCall[] {
		return calls.map((call) => new PendingCall(call.callId, call.toolName, call.args, this.effectOf(catalog, call)));
	}

	public holdsAny(calls: readonly PendingCall[]): boolean {
		return calls.some((call) => call.isHeld);
	}

	/**
	 * A tool the runtime owns answers to no policy: nothing an application wrote declared it.
	 * A call to something that is not in the catalog is not held either, because there is no
	 * effect to hold it for and the executor will answer the model that it does not exist.
	 */
	private effectOf(catalog: ToolCatalog, call: ToolCall): string | undefined {
		if (!catalog.has(call.toolName)) return undefined;
		const tool = catalog.findOrFail(call.toolName);
		if (tool.internal) return undefined;
		const invocation = new ToolInvocation(call.callId, call.toolName, call.args);
		return this.policy.requires(tool, invocation) ? tool.effect.name : undefined;
	}
}
