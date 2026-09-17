import type { ToolSource } from "../../contracts/tool/tool-source.contract";
import type { AdkAccessPolicy } from "../../domain/tool/access/adk-access.policy";
import { OpenAccessPolicy } from "../../domain/tool/access/open-access.policy";
import type { AdkApprovalPolicy } from "../../domain/tool/approval/adk-approval.policy";
import { EffectApprovalPolicy } from "../../domain/tool/approval/effect-approval.policy";

/** The fields a caller may name; one left out keeps whatever the options already hold. */
export interface ToolingOptionsPatch {
	approvals?: AdkApprovalPolicy;
	/** Who may call which tool. Consulted on every invocation, by the agent loop and by an MCP server alike. */
	access?: AdkAccessPolicy;
	sources?: readonly ToolSource[];
}

/**
 * Which tools a run can reach, who may call them, and which of them stop in front of a
 * person first.
 *
 * Both gates are asked on every invocation and in that order: access decides whether the
 * call is the actor's to make at all, and approval decides whether somebody has to say yes
 * to an effect. Neither has an off switch that is not a policy somebody wrote down.
 */
export class ToolingOptions {
	public constructor(
		/**
		 * A tool declared destructive stops in front of a human unless the application says
		 * otherwise, which is the safe half of the trade: the cost of the default being wrong is a
		 * run that waits, and the cost the other way is an effect nobody agreed to.
		 */
		public readonly approvals: AdkApprovalPolicy = EffectApprovalPolicy.destructiveOnly(),
		public readonly access: AdkAccessPolicy = new OpenAccessPolicy(),
		public readonly sources: readonly ToolSource[] = [],
	) {}

	/** Options built from names instead of positions, with the same defaults as declaring none. */
	public static from(patch: ToolingOptionsPatch): ToolingOptions {
		return new ToolingOptions().with(patch);
	}

	/** A copy with the named fields replaced and every other field kept. */
	public with(patch: ToolingOptionsPatch): ToolingOptions {
		return new ToolingOptions(
			patch.approvals ?? this.approvals,
			patch.access ?? this.access,
			patch.sources ?? this.sources,
		);
	}
}
