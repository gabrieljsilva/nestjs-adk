import {
	InvalidStructuredOutputError,
	type LlmModel,
	ModelExecutor,
	ModelRequest,
	PromptInstructions,
	UserMessage,
} from "@nestjs-adk/core";
import { JudgeRubric } from "./judge-rubric";
import { JudgeVerdict } from "./judge-verdict";

const INSTRUCTIONS = [
	"You grade one answer against criteria.",
	'Reply with JSON only, as {"score": number between 0 and 1, "reason": short sentence}.',
	"Score how completely the answer satisfies the criteria, not how well it is written.",
].join(" ");

/** The shape the judge is asked for, and the only thing it is allowed to answer with. */
const SCHEMA = {
	type: "object",
	properties: { score: { type: "number" }, reason: { type: "string" } },
	required: ["score", "reason"],
};

/**
 * Asks a model whether an answer satisfies criteria, for assertions a string cannot make.
 *
 * A generated answer is worded differently every run, so `toBe` and `toContain` either
 * fail on a rewrite or assert so little that they pass on anything. A rubric asserts what
 * the answer had to contain and lets the wording move.
 *
 * The judge is a model like any other, so it costs a call and can be wrong: use a cheap
 * one, keep the criteria narrow, and treat a verdict as one opinion rather than a fact.
 * A judge that answers outside the shape it was asked for fails loudly, because a verdict
 * nobody can read is worse than no verdict.
 */
export class LlmJudge {
	public constructor(
		private readonly model: LlmModel,
		private readonly executor: ModelExecutor = new ModelExecutor(),
	) {}

	public async judge(answer: string, rubric: JudgeRubric): Promise<JudgeVerdict> {
		const response = await this.executor.execute(this.model, this.requestFor(answer, rubric));
		const verdict = this.readVerdict(response.structuredOutput ?? this.parsed(response.text), response.text);
		return JudgeVerdict.of(rubric.passes(verdict.score), verdict.score, verdict.reason);
	}

	private requestFor(answer: string, rubric: JudgeRubric): ModelRequest {
		const question = `Criteria: ${rubric.criteria}\n\nAnswer to grade:\n${answer}`;
		return new ModelRequest([new UserMessage(question)], [], PromptInstructions.from(INSTRUCTIONS), SCHEMA);
	}

	/** A model without structured output still answers JSON, and it is read the same way. */
	private parsed(text: string): unknown {
		try {
			return JSON.parse(text.trim());
		} catch {
			return undefined;
		}
	}

	private readVerdict(parsed: unknown, answered: string): { score: number; reason: string } {
		if (typeof parsed !== "object" || parsed === null) {
			throw new InvalidStructuredOutputError("the judge did not answer an object", answered);
		}
		const score = Reflect.get(parsed, "score");
		const reason = Reflect.get(parsed, "reason");
		if (typeof score !== "number" || !Number.isFinite(score)) {
			throw new InvalidStructuredOutputError("the judge answered no score", answered);
		}
		return { score, reason: typeof reason === "string" ? reason : "" };
	}
}
