import type { AdkEngine, ModelInput } from "@nestjs-adk/core";

export interface JudgeVerdict {
	pass: boolean;
	reasoning: string;
}

/** Function that sends the judging prompt to the LLM and returns the raw text. */
export type JudgeFn = (prompt: string) => Promise<string>;

/** Judge via the AdkEngine contract (agnostic): runs a minimal agent with no tools and collects the final text. */
export function engineJudge(engine: AdkEngine, model: ModelInput): JudgeFn {
	return async (prompt) => {
		let finalText = "";
		const events = engine.run(
			{ name: "adk_judge", description: "LLM as judge", instruction: undefined, model, tools: [], subAgents: [] },
			{ message: prompt },
		);
		for await (const event of events) {
			if (event.type === "final") finalText = event.text;
		}
		return finalText;
	};
}

/**
 * LLM as judge: evaluates non-deterministic text against a rubric.
 * The judge's reasoning shows up in the test's failure message.
 */
export function expectJudged(value: string) {
	return {
		async toSatisfy(rubric: string, options: { judge: JudgeFn }): Promise<JudgeVerdict> {
			const prompt = [
				"You are a strict evaluator of AI responses.",
				`RUBRIC: ${rubric}`,
				`EVALUATED RESPONSE:\n${value}`,
				'Answer ONLY with JSON: {"pass": boolean, "reasoning": string}',
			].join("\n\n");

			const raw = await options.judge(prompt);
			const verdict = parseVerdict(raw);
			if (!verdict.pass) {
				throw new Error(`Judge rejected the response.\nRubric: ${rubric}\nReasoning: ${verdict.reasoning}`);
			}
			return verdict;
		},
	};
}

function parseVerdict(raw: string): JudgeVerdict {
	const match = raw.match(/\{[\s\S]*\}/);
	if (!match) throw new Error(`Judge returned a non-JSON payload: ${raw}`);
	const parsed = JSON.parse(match[0]) as Partial<JudgeVerdict>;
	return { pass: parsed.pass === true, reasoning: String(parsed.reasoning ?? "") };
}
