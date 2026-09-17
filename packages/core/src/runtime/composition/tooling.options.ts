import type { ToolSource } from "../../contracts/tool/tool-source.contract";
import type { AdkAccessPolicy } from "../../domain/tool/access/adk-access.policy";
import { OpenAccessPolicy } from "../../domain/tool/access/open-access.policy";
import type { AdkApprovalPolicy } from "../../domain/tool/approval/adk-approval.policy";
import { EffectApprovalPolicy } from "../../domain/tool/approval/effect-approval.policy";

/** The fields a caller may name; one left out keeps whatever the options already hold. */
export interface ToolingOptionsPatch {
	approvals?: AdkApprovalPolicy;
	access?: AdkAccessPolicy;
	sources?: readonly ToolSource[];
}

/**
 * Which tools a run can reach, who may call them, and which of them stop in front of a
 * person first.
 *
 * Both gates are asked on every invocation and in that order: access decides whether the
 * call is the actor's to make, approval whether somebody has to say yes to an effect. By
 * default a tool declared destructive waits for a human.
 */
export class ToolingOptions {
	public constructor(
		public readonly approvals: AdkApprovalPolicy = EffectApprovalPolicy.destructiveOnly(),
		public readonly access: AdkAccessPolicy = new OpenAccessPolicy(),
		public readonly sources: readonly ToolSource[] = [],
	) {}

	public static from(patch: ToolingOptionsPatch): ToolingOptions {
		return new ToolingOptions().with(patch);
	}

	public with(patch: ToolingOptionsPatch): ToolingOptions {
		return new ToolingOptions(
			patch.approvals ?? this.approvals,
			patch.access ?? this.access,
			patch.sources ?? this.sources,
		);
	}
}
