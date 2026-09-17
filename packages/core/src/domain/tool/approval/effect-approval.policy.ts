import type { Actor } from "../access/actor.value-object";
import type { ToolInvocation } from "../invocation/tool-invocation.value-object";
import type { ToolDefinition } from "../tool-definition.value-object";
import { AdkApprovalPolicy } from "./adk-approval.policy";
import { ToolEffect } from "./tool-effect.value-object";

/** Asks for approval from one effect upwards, and never below it. */
export class EffectApprovalPolicy extends AdkApprovalPolicy {
	private constructor(private readonly threshold: ToolEffect | undefined) {
		super();
	}

	public static from(threshold: ToolEffect): EffectApprovalPolicy {
		return new EffectApprovalPolicy(threshold);
	}

	public static never(): EffectApprovalPolicy {
		return new EffectApprovalPolicy(undefined);
	}

	public static destructiveOnly(): EffectApprovalPolicy {
		return new EffectApprovalPolicy(ToolEffect.DESTRUCTIVE);
	}

	public requires(tool: ToolDefinition, _invocation: ToolInvocation, _actor?: Actor): boolean {
		return this.threshold !== undefined && tool.effect.isAtLeast(this.threshold);
	}
}
