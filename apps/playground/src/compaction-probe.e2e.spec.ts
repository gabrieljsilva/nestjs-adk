import "reflect-metadata";
import { type ContextBlock, ContextSummarizer, TokenThresholdCompactionPolicy } from "@nestjs-adk/core";
import { ScriptedModel } from "@nestjs-adk/testing";
import { describe, it } from "vitest";
import { SendMessageUseCase } from "./chat/send-message.use-case";
import { bootStore } from "./testing/store-app.fixture";

class LoudSummarizer extends ContextSummarizer {
	public async summarize(blocks: readonly ContextBlock[]): Promise<string> {
		console.log(`  summarizer called with ${blocks.length} blocks`);
		return `RESUMO DE ${blocks.length} TRECHOS`;
	}
}

describe("probe", () => {
	it("prints what each turn sent", async () => {
		const detail = "detalhe ".repeat(60);
		const model = new ScriptedModel("scripted").reportsPromptTokens(2_500);
		const app = await bootStore(model, {
			compaction: new TokenThresholdCompactionPolicy(2_000, 1_800, 1),
			summarizer: new LoudSummarizer(),
		});

		let sessionId: string | undefined;
		for (let turn = 0; turn < 6; turn += 1) {
			model.mockText(`resposta ${turn} ${detail}`);
			const result = await app.get(SendMessageUseCase).execute(`pergunta ${turn} ${detail}`, sessionId);
			sessionId = result.sessionId.value;
			const request = model.requests.at(-1);
			const chars = (request?.messages ?? []).reduce((total, message) => total + message.text.length, 0);
			console.log(
				`turn ${turn}: messages=${request?.messages.length} chars=${chars} instructions=${request?.instructions?.text.length}`,
			);
		}
		await app.close();
	});
});
