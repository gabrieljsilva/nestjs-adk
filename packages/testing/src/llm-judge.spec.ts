import { InvalidStructuredOutputError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { JudgeRubric } from "./judge-rubric";
import { LlmJudge } from "./llm-judge";
import { ScriptedModel } from "./scripted-model";

const RUBRIC = JudgeRubric.of("names the order id and says it shipped");

function judgeAnswering(text: string): LlmJudge {
	return new LlmJudge(new ScriptedModel().mockText(text));
}

describe("LlmJudge", () => {
	it("passes an answer the judge scored above the threshold", async () => {
		const verdict = await judgeAnswering('{"score":0.9,"reason":"it names 42 and says shipped"}').judge(
			"order 42 has shipped",
			RUBRIC,
		);

		expect(verdict.passed).toBe(true);
		expect(verdict.score).toBe(0.9);
		expect(verdict.reason).toContain("42");
	});

	it("fails an answer below the threshold, and keeps the reason for the failure message", async () => {
		const verdict = await judgeAnswering('{"score":0.2,"reason":"it never says what happened to the order"}').judge(
			"I looked into it",
			RUBRIC,
		);

		expect(verdict.passed).toBe(false);
		expect(verdict.reason).toContain("never says");
	});

	it("uses the threshold the rubric declared", async () => {
		const strict = JudgeRubric.of("mentions the refund", 0.95);

		const verdict = await judgeAnswering('{"score":0.9,"reason":"close"}').judge("refunded", strict);

		expect(verdict.passed).toBe(false);
	});

	it("refuses a verdict it cannot read, instead of inventing one", async () => {
		await expect(judgeAnswering("looks good to me").judge("order 42 shipped", RUBRIC)).rejects.toBeInstanceOf(
			InvalidStructuredOutputError,
		);
	});

	it("refuses a verdict with no score", async () => {
		await expect(judgeAnswering('{"reason":"good"}').judge("order 42 shipped", RUBRIC)).rejects.toBeInstanceOf(
			InvalidStructuredOutputError,
		);
	});

	it("survives a judge that scored without explaining", async () => {
		const verdict = await judgeAnswering('{"score":1}').judge("order 42 shipped", RUBRIC);

		expect(verdict.passed).toBe(true);
		expect(verdict.reason).toBe("");
	});
});
