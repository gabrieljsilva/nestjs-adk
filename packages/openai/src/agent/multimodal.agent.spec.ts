import {
	AdkRuntimeHost,
	AgentName,
	AgentRunCommand,
	AskInput,
	InMemoryArtifactStorage,
	InMemorySessionStorage,
	MediaPart,
} from "@nestjs-adk/core";
import { TestImage } from "@nestjs-adk/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RandomIdGenerator, SystemClock, agentOf, apiKeyFromEnvironment, cheapModel } from "./agent-suite.fixture";

const apiKey = apiKeyFromEnvironment();
const VIEWER = AgentName.from("viewer");
const RED = /vermelh|red/i;

/** A solid red square somebody else is hosting, which is what an upload leaves behind. */
const HOSTED_RED = "https://placehold.co/240x240/ff0000/ff0000.png";

/**
 * The two ways an image reaches OpenAI, against the real API.
 *
 * Chat Completions carries both in one field: `image_url.url` is either the address the
 * provider fetches or the data URL the bytes became. A fake proves the mapper builds that
 * field; only this proves OpenAI accepts what it builds.
 */
describe.runIf(apiKey)("AGENT: an image OpenAI actually looks at", () => {
	const host = new AdkRuntimeHost();

	beforeAll(async () => {
		if (apiKey === undefined) return;
		await host.start(
			[agentOf(VIEWER, "Responda em uma palavra, sempre em português.", cheapModel(apiKey))],
			new InMemorySessionStorage(),
			new InMemoryArtifactStorage(new RandomIdGenerator()),
			new SystemClock(),
			new RandomIdGenerator(),
		);
	});

	afterAll(async () => {
		await host.stop();
	});

	it("answers about bytes attached to the question", { timeout: 60_000 }, async () => {
		const red = TestImage.red();
		const image = MediaPart.image(red.mediaType, red.toBase64());

		const result = await host.runtime.runner.ask(
			new AgentRunCommand(VIEWER, AskInput.with("Qual é a cor desta imagem?", [image])),
		);

		expect(result.text).toMatch(RED);
		expect(result.status.name).toBe("completed");
	});

	it("answers about an image it fetched from a link", { timeout: 60_000 }, async () => {
		const image = MediaPart.link(HOSTED_RED, "image/png");

		const result = await host.runtime.runner.ask(
			new AgentRunCommand(VIEWER, AskInput.with("Qual é a cor desta imagem?", [image])),
		);

		expect(result.text).toMatch(RED);
	});
});
