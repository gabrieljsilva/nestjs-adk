import {
	InvalidStructuredOutputError,
	type LlmModel,
	ModelExecutor,
	ModelRequest,
	PromptInstructions,
	UserMessage,
} from "@nestjs-adk/core";
import { JudgeRubric } from "./judge-rubric.value-object";
import { JudgeVerdict } from "./judge-verdict.value-object";

const INSTRUCTIONS = [
	"You grade one answer against criteria.",
	'Reply with JSON only, as {"score": number between 0 and 1, "reason": short sentence}.',
	"Score how completely the answer satisfies the criteria, not how well it is written.",
].join(" ");

const SCHEMA = {
	type: "object",
	properties: { score: { type: "number" }, reason: { type: "string" } },
	required: ["score", "reason"],
	additionalProperties: false,
};

/**
 * Grades prose a string match cannot assert, by asking a model to judge an answer against a
 * rubric. It costs a provider call per judgement, so it belongs in a suite that means to spend.
 */
export class LlmJudge {
	public constructor(
		private readonly model: LlmModel,
		private readonly executor: ModelExecutor = new ModelExecutor(),
	) {}

	public async judge(answer: string, rubric: JudgeRubric): Promise<JudgeVerdict> {
		const response = await this.executor.execute(undefined, this.model, this.buildRequest(answer, rubric));
		const verdict = this.readVerdict(response.structuredOutput ?? this.parsed(response.text), response.text);
		return new JudgeVerdict(rubric.passes(verdict.score), verdict.score, verdict.reason);
	}

	private buildRequest(answer: string, rubric: JudgeRubric): ModelRequest {
		const question = `Criteria: ${rubric.criteria}\n\nAnswer to grade:\n${answer}`;
		return new ModelRequest([new UserMessage(question)], [], PromptInstructions.from(INSTRUCTIONS), SCHEMA);
	}

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
