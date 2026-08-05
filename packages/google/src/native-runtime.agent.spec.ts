import {
	AdkRuntimeHost,
	AgentDefinition,
	AgentDescription,
	AgentName,
	AgentRunCommand,
	AskInput,
	Clock,
	DeclaredAgent,
	IdGenerator,
	InMemoryArtifactStorage,
	InMemorySessionStorage,
	Instant,
	PromptInstructions,
	ToolDefinition,
	ToolEffect,
	ToolHandler,
	ZodToolSchema,
} from "@nestjs-adk/core/native";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { GeminiModel } from "./gemini-model";

// Loads the root .env (GEMINI_API_KEY): without a key, the whole suite is skipped (CI doesn't break).
try {
	process.loadEnvFile(new URL("../../../.env", import.meta.url).pathname);
} catch {
	// no .env: proceed with just the process environment
}

const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENAI_API_KEY;
const MODEL = "gemini-3.5-flash-lite";
const SUPPORT = AgentName.from("greeter");

/**
 * The one place a real provider meets the native runtime.
 *
 * Everything else about Gemini is proved against a fake transport, which is faster and
 * deterministic. What a fake cannot prove is that the request this adapter builds is one
 * Google actually accepts, so this suite asks the smallest question that has an answer
 * and reads only what it must: that words came back and that the provider reported what
 * the turn cost.
 */
class SystemClock extends Clock {
	public now(): Instant {
		return Instant.fromEpochMillis(Date.now());
	}
}

class RandomIdGenerator extends IdGenerator {
	public next(): string {
		return crypto.randomUUID();
	}
}

function greeterOf(tools: readonly ToolDefinition[] = []): DeclaredAgent {
	const definition = AgentDefinition.of(
		SUPPORT,
		AgentDescription.from("Greets in one short sentence", SUPPORT.value),
		new GeminiModel(MODEL, { apiKey, maxOutputTokens: 64, temperature: 0 }),
		PromptInstructions.from("Answer in a single short sentence, in the language you were greeted in."),
		undefined,
		tools,
	);
	return new DeclaredAgent(definition, "GreeterAgent");
}

/** Answers a fixed number, so the only thing under test is whether Google took the declaration. */
class ColourHandler extends ToolHandler {
	public calls = 0;

	public async invoke(args: Record<string, unknown>): Promise<unknown> {
		this.calls += 1;
		return { thing: args.thing, colour: "azul" };
	}
}

function colourOf(handler: ToolHandler): ToolDefinition {
	return new ToolDefinition(
		"colour_of",
		"Answers the colour of a thing.",
		ZodToolSchema.of(z.object({ thing: z.string().describe("The thing to look up") })),
		ToolEffect.READ,
		handler,
	);
}

describe.runIf(apiKey)("AGENT: native runtime over REAL Gemini", () => {
	const host = new AdkRuntimeHost();
	const storage = new InMemorySessionStorage();
	const artifacts = new InMemoryArtifactStorage(new RandomIdGenerator());

	beforeAll(async () => {
		await host.start([greeterOf()], storage, artifacts, new SystemClock(), new RandomIdGenerator());
	});

	afterAll(async () => {
		await host.stop();
	});

	it("answers a greeting and reports what the turn cost", { timeout: 60_000 }, async () => {
		const result = await host.runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("Oi")));

		expect(result.text.length).toBeGreaterThan(0);
		expect(result.status.name).toBe("completed");
	});

	it("keeps the conversation, so a follow up is answered with the first turn in view", async () => {
		const first = await host.runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("Olá, meu nome é Gabriel.")));

		const second = await host.runtime.runner.ask(
			new AgentRunCommand(SUPPORT, AskInput.of("Qual é o meu nome?", first.sessionId)),
		);

		expect(second.sessionId.value).toBe(first.sessionId.value);
		expect(second.text.toLowerCase()).toContain("gabriel");
	});

	it("sends a tool declaration derived from zod that Google accepts, and calls it", { timeout: 60_000 }, async () => {
		const handler = new ColourHandler();
		const withTool = new AdkRuntimeHost();
		await withTool.start(
			[greeterOf([colourOf(handler)])],
			new InMemorySessionStorage(),
			new InMemoryArtifactStorage(new RandomIdGenerator()),
			new SystemClock(),
			new RandomIdGenerator(),
		);

		const result = await withTool.runtime.runner.ask(
			new AgentRunCommand(SUPPORT, AskInput.of("Qual a cor do céu? Use a ferramenta.")),
		);
		await withTool.stop();

		expect(handler.calls).toBe(1);
		expect(result.text.toLowerCase()).toContain("azul");
	});
});
