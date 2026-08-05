import { JudgeRubric, LlmJudge } from "@nestjs-adk/testing";
import { describe, expect, it } from "vitest";
import { apiKeyFromEnvironment, cheapModel } from "./agent-suite.fixture";

const apiKey = apiKeyFromEnvironment();
const RUBRIC = JudgeRubric.of("says the order number 42 and that it has been shipped");

/**
 * The judge, against a real model, on answers that are fixed.
 *
 * Nothing is generated here: the two answers are written in the test, so what is under
 * test is the judge and not the agent. That keeps it to one call per case and keeps the
 * assertion about the thing that would otherwise never be checked, which is whether a real
 * model reads a rubric and grades against it instead of grading the writing.
 */
describe.runIf(apiKey)("AGENT: LLM as judge over real Gemini", () => {
	function judge(): LlmJudge {
		if (apiKey === undefined) throw new Error("no api key");
		return new LlmJudge(cheapModel(apiKey));
	}

	it("passes an answer that satisfies the rubric", { timeout: 60_000 }, async () => {
		const verdict = await judge().judge("Your order 42 was shipped this morning.", RUBRIC);

		expect(verdict.passed).toBe(true);
		expect(verdict.score).toBeGreaterThan(0.5);
	});

	it("fails an answer that says none of what was asked for", { timeout: 60_000 }, async () => {
		const verdict = await judge().judge("I will look into it and get back to you.", RUBRIC);

		expect(verdict.passed).toBe(false);
		expect(verdict.reason.length).toBeGreaterThan(0);
	});
});
