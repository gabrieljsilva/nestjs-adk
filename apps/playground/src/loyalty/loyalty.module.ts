import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AdkModuleOptions, type LlmModel } from "@nestjs-adk/core";
import { Module } from "@nestjs/common";
import { ClubGuestAgent } from "./club-guest.agent";
import { ClubRulesAgent } from "./club-rules.agent";
import { ClubAgent } from "./club.agent";
import { FindMemberUseCase } from "./find-member.use-case";
import { MemberRepository } from "./member.repository";

/**
 * Where the club keeps its prompts, resolved from this file rather than from the process.
 *
 * A relative path in the module option would resolve against whatever directory the
 * application was started from, which is not where the prompts are. Building the absolute
 * path here is the pattern to copy: it answers the same whoever ran the process.
 */
export const CLUB_PROMPTS = join(dirname(fileURLToPath(import.meta.url)), "prompts");

/** The club as its own application, so a prompt read from a file is proved on its own. */
export function clubOptions(defaultModel: LlmModel, dir: string = CLUB_PROMPTS): AdkModuleOptions {
	return AdkModuleOptions.from({ defaultModel, prompts: { dir } });
}

@Module({
	providers: [MemberRepository, FindMemberUseCase, ClubAgent, ClubRulesAgent, ClubGuestAgent],
	exports: [ClubAgent, ClubRulesAgent, ClubGuestAgent],
})
export class LoyaltyModule {}
