import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import { AdkModule, MissingPromptVariablesError, PromptNotFoundError } from "@nestjs-adk/core";
import { AdkTestBedBuilder, ScriptedModel } from "@nestjs-adk/testing";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { ClubGuestAgent } from "./club-guest.agent";
import { ClubRulesAgent } from "./club-rules.agent";
import { ClubAgent } from "./club.agent";
import { MemberNotFoundError } from "./errors/member-not-found.error";
import { LoyaltyModule, clubOptions } from "./loyalty.module";

const ANA = "ana@nebula.games";
const QUIET = "quiet@nebula.games";
const STRANGER = "stranger@nebula.games";

/** The club on its own, with a directory of prompts a test can point somewhere else. */
async function clubBed(dir?: string) {
	const model = new ScriptedModel("club");
	return await AdkTestBedBuilder.from(
		Test.createTestingModule({ imports: [AdkModule.forRoot(clubOptions(model, dir)), LoyaltyModule] }),
	)
		.withScript(ClubAgent, (script) => script.mockText("noted").mockText("noted again"))
		.withScript(ClubRulesAgent, (script) => script.mockText("they expire in twelve months"))
		.withScript(ClubGuestAgent, (script) => script.mockText("joining is free"))
		.boot();
}

describe("the Nébula Club, whose prompts are built per run", () => {
	it("sends the concierge a prompt read from a file, with this member's own data in it", async () => {
		await using bed = await clubBed();
		const club = bed.agent(ClubAgent);

		await club.ask("how many points do I have?", { owner: ANA });

		expect(club.lastInstruction()).toContain("talking to Ana");
		expect(club.lastInstruction()).toContain("a gold member and earn 2 points per real");
	});

	it("builds it for whoever owns the session, not for whoever asked last", async () => {
		await using bed = await clubBed();
		const club = bed.agent(ClubAgent);

		await club.ask("what is my tier?", { owner: "bruno@nebula.games" });

		expect(club.lastInstruction()).toContain("talking to Bruno");
		expect(club.lastInstruction()).toContain("earn 4 points per real");
	});

	/** The owner is recorded on the session, so continuing it keeps building for the same person. */
	it("keeps building for the same member when the conversation carries on", async () => {
		await using bed = await clubBed();
		const club = bed.agent(ClubAgent);

		await club.ask("how many points do I have?", { owner: ANA });
		await club.ask("and how do they expire?");

		expect(club.lastInstruction()).toContain("talking to Ana");
	});

	it("serves the rules desk a file with no variables at all", async () => {
		await using bed = await clubBed();
		const rules = bed.agent(ClubRulesAgent);

		await rules.ask("do points expire?");

		expect(rules.lastInstruction()).toContain("points expire twelve months after they are earned");
		expect(rules.lastInstruction()).not.toContain("{{");
	});

	it("interpolates the guest desk's own string, with no file and no source", async () => {
		await using bed = await clubBed();
		const guest = bed.agent(ClubGuestAgent);

		const run = await guest.ask("what is the club?");

		expect(guest.lastInstruction()).toContain("a silver member earns one point per real spent");
		expect(guest.lastInstruction()).toContain(run.sessionId.value);
	});

	/**
	 * The claim the disclaimer makes, measured here rather than asserted in prose: a prompt
	 * whose variable part is a name and a tier leaves the rest of the prefix identical, so the
	 * provider still caches it. A timestamp in there is what would break this case.
	 */
	it("keeps a cacheable prefix across two runs for the same member", async () => {
		await using bed = await clubBed();
		const club = bed.get(ClubAgent);

		const [first] = await club.explain("how many points do I have?", { owner: ANA });
		const [second] = await club.explain("and what is my tier?", { owner: ANA });

		expect([first, second]).toHaveStablePrefix(0.8);
	});

	describe("when the prompt cannot be built", () => {
		it("fails the run for somebody the club does not know", async () => {
			await using bed = await clubBed();

			await expect(bed.agent(ClubAgent).ask("who am I?", { owner: STRANGER })).rejects.toBeInstanceOf(MemberNotFoundError);
		});

		/** A member who never filled their profile in leaves a required variable with nothing to fill it. */
		it("fails naming the variable when the member has no name", async () => {
			await using bed = await clubBed();

			await expect(bed.agent(ClubAgent).ask("who am I?", { owner: QUIET })).rejects.toBeInstanceOf(
				MissingPromptVariablesError,
			);
		});

		it("asks the model nothing when the prompt failed", async () => {
			await using bed = await clubBed();
			const club = bed.agent(ClubAgent);

			await expect(club.ask("who am I?", { owner: STRANGER })).rejects.toThrow();

			expect(bed.script(ClubAgent)?.requests).toEqual([]);
		});

		it("fails naming the file when the prompts directory is not where the prompts are", async () => {
			await using bed = await clubBed("/nebula/no-prompts-here");

			await expect(bed.agent(ClubAgent).ask("who am I?", { owner: ANA })).rejects.toBeInstanceOf(PromptNotFoundError);
		});

		it("says where it looked, so the wrong directory is the message rather than a guess", async () => {
			await using bed = await clubBed("/nebula/no-prompts-here");

			await expect(bed.agent(ClubAgent).ask("who am I?", { owner: ANA })).rejects.toThrowError(
				/\/nebula\/no-prompts-here\/club-concierge\.md/,
			);
		});
	});
});
