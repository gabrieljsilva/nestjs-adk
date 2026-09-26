import { AdkAgent, Agent, MetadataKey, type PromptContext } from "@nestjs-adk/core";
import { FindMemberUseCase } from "./find-member.use-case";

export const MEMBER_ID = MetadataKey.fromName<string>(
	"memberId",
	(value): value is string => typeof value === "string",
);

@Agent({
	name: "club",
	description: "Nébula Club concierge: answers a member about their own account and points.",
})
export class ClubAgent extends AdkAgent {
	public constructor(private readonly members: FindMemberUseCase) {
		super();
	}

	protected override async prompt(context: PromptContext): Promise<string> {
		const member = this.members.execute(context.metadata.find(MEMBER_ID) ?? "");
		return this.prompting.renderFromFileOrFail("club-concierge.md", {
			name: member.name,
			tier: member.tier,
			points: member.pointsPerReal,
		});
	}
}
