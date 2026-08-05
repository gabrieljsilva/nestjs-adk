import {
	AdkRuntimeHost,
	AgentName,
	AgentRunCommand,
	AskInput,
	InMemoryArtifactStorage,
	InMemorySessionStorage,
	ToolDefinition,
	ToolEffect,
	ToolHandler,
	ZodToolSchema,
} from "@nestjs-adk/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { agentOf, apiKeyFromEnvironment, toolModel } from "./agent-suite.fixture";
import { RandomIdGenerator } from "./random-id-generator.fixture";
import { SystemClock } from "./system-clock.fixture";

const apiKey = apiKeyFromEnvironment();
const SUPPORT = AgentName.from("support");

/** Answers a number only this tool knows, so the model cannot have guessed it. */
class StockHandler extends ToolHandler {
	public calls = 0;

	public async invoke(args: Record<string, unknown>): Promise<unknown> {
		this.calls += 1;
		return { sku: args.sku, units: 137 };
	}
}

function stockTool(handler: ToolHandler, effect = ToolEffect.READ): ToolDefinition {
	return new ToolDefinition(
		"stock_of",
		"Answers how many units of a SKU are in stock.",
		ZodToolSchema.of(z.object({ sku: z.string().describe("The SKU to look up") })),
		effect,
		handler,
	);
}

describe.runIf(apiKey)("AGENT: tool calls over real Gemini", () => {
	const host = new AdkRuntimeHost();
	const handler = new StockHandler();

	beforeAll(async () => {
		if (apiKey === undefined) return;
		await host.start(
			[
				agentOf(
					SUPPORT,
					"Responda usando as ferramentas quando existir uma. Responda em uma frase curta.",
					toolModel(apiKey),
					[stockTool(handler)],
				),
			],
			new InMemorySessionStorage(),
			new InMemoryArtifactStorage(new RandomIdGenerator()),
			new SystemClock(),
			new RandomIdGenerator(),
		);
	});

	afterAll(async () => {
		await host.stop();
	});

	it("calls the tool and answers with what it returned", { timeout: 60_000 }, async () => {
		const result = await host.runtime.runner.ask(
			new AgentRunCommand(SUPPORT, AskInput.of("Quantas unidades do SKU-9 estão em estoque? Use a ferramenta.")),
		);

		expect(handler.calls).toBe(1);
		expect(result.text).toContain("137");
		expect(result.status.name).toBe("completed");
	});

	it("answers a plain greeting without reaching for a tool", { timeout: 60_000 }, async () => {
		const before = handler.calls;

		const result = await host.runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("Oi")));

		expect(result.text.length).toBeGreaterThan(0);
		expect(handler.calls).toBe(before);
	});
});
