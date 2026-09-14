import { AdkAgent, Agent, MetadataKey, type PromptContext } from "@nestjs-adk/core";
import { FindMemberUseCase } from "./find-member.use-case";

/** The key the club writes the member under, declared once so nothing reads a raw string. */
export const MEMBER_ID = MetadataKey.fromName<string>(
	"memberId",
	(value): value is string => typeof value === "string",
);

/**
 * The desk that knows who it is talking to.
 *
 * Its prompt is a file with the member's own data interpolated into it, built once for each
 * run from the session's own metadata. The data reaches the system prompt rather than the message,
 * which is the difference that matters: the model reads a name it was instructed with
 * instead of a name somebody typed at it.
 *
 * The variable part is a name and a tier, both stable for the whole conversation. That is
 * the shape to keep: what changes per run is a short line, and everything after it stays
 * byte for byte the same, so the provider still caches the prefix.
 */
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
