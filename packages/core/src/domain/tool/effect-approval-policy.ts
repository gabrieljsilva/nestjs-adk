import { AdkApprovalPolicy } from "./adk-approval-policy";
import type { ToolDefinition } from "./tool-definition";
import { ToolEffect } from "./tool-effect";
import type { ToolInvocation } from "./tool-invocation";

/**
 * Asks for approval from one effect upwards, and never below it.
 *
 * This is what a declared threshold becomes, and it is deliberately the only thing the
 * default policy knows how to do. Anything that depends on who is asking, on the time of
 * day or on the size of the refund is an application decision, and an application that
 * has one writes its own policy instead of configuring this one further.
 */
export class EffectApprovalPolicy extends AdkApprovalPolicy {
	private constructor(private readonly threshold: ToolEffect | undefined) {
		super();
	}

	public static from(threshold: ToolEffect): EffectApprovalPolicy {
		return new EffectApprovalPolicy(threshold);
	}

	/** Nothing is stopped by default: a tool an application declared is a tool it meant to offer. */
	public static never(): EffectApprovalPolicy {
		return new EffectApprovalPolicy(undefined);
	}

	public static destructiveOnly(): EffectApprovalPolicy {
		return new EffectApprovalPolicy(ToolEffect.DESTRUCTIVE);
	}

	public requires(tool: ToolDefinition, _invocation: ToolInvocation): boolean {
		return this.threshold !== undefined && tool.effect.isAtLeast(this.threshold);
	}
}
