import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AdkModuleOptions, type LlmModel } from "@nestjs-adk/core";
import { Module } from "@nestjs/common";
import { ClubGuestAgent } from "./club-guest.agent";
import { ClubRulesAgent } from "./club-rules.agent";
import { ClubAgent } from "./club.agent";
import { FindMemberUseCase } from "./find-member.use-case";
import { MemberRepository } from "./member.repository";

export const CLUB_PROMPTS = join(dirname(fileURLToPath(import.meta.url)), "prompts");

export function clubOptions(defaultModel: LlmModel, dir: string = CLUB_PROMPTS): AdkModuleOptions {
	return AdkModuleOptions.from({ defaultModel, prompts: { dir } });
}

@Module({
	providers: [MemberRepository, FindMemberUseCase, ClubAgent, ClubRulesAgent, ClubGuestAgent],
	exports: [ClubAgent, ClubRulesAgent, ClubGuestAgent],
})
export class LoyaltyModule {}
