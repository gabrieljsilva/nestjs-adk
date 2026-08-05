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
import { agentOf, apiKeyFromEnvironment, cheapModel } from "./agent-suite.fixture";
import { RandomIdGenerator } from "./random-id-generator.fixture";
import { SystemClock } from "./system-clock.fixture";

const apiKey = apiKeyFromEnvironment();
const VIEWER = AgentName.from("viewer");
const RED = /vermelh|red/i;

/** A solid red square somebody else is hosting, which is what an upload leaves behind. */
const HOSTED_RED = "https://placehold.co/240x240/ff0000/ff0000.png";

function redSquare(): MediaPart {
	const red = TestImage.red();
	return MediaPart.image(red.mediaType, red.toBase64());
}

/**
 * The one place an image meets a provider that actually decodes it.
 *
 * Everything else about multimodal is proved against fakes, which is faster and free. What
 * a fake cannot prove is that Google accepts the inline part this adapter builds and that
 * the image survives a turn as an artifact reference, so this asks the smallest question
 * with one right answer: a solid square, and what colour it is.
 */
describe.runIf(apiKey)("AGENT: an image the model actually looks at", () => {
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

	it("answers about the image that was attached to the question", { timeout: 60_000 }, async () => {
		const result = await host.runtime.runner.ask(
			new AgentRunCommand(VIEWER, AskInput.with("Qual é a cor desta imagem?", [redSquare()])),
		);

		expect(result.text).toMatch(RED);
		expect(result.status.name).toBe("completed");
	});

	it("answers about an image it fetched from a link", { timeout: 60_000 }, async () => {
		const result = await host.runtime.runner.ask(
			new AgentRunCommand(VIEWER, AskInput.with("Qual é a cor desta imagem?", [MediaPart.link(HOSTED_RED, "image/png")])),
		);

		expect(result.text).toMatch(RED);
	});

	it("still has the image on the next turn, without it being sent again", { timeout: 60_000 }, async () => {
		const first = await host.runtime.runner.ask(
			new AgentRunCommand(VIEWER, AskInput.with("Guarde esta imagem.", [redSquare()])),
		);

		const second = await host.runtime.runner.ask(
			new AgentRunCommand(VIEWER, AskInput.of("Qual era a cor da imagem que eu enviei?", first.sessionId)),
		);

		expect(second.sessionId.value).toBe(first.sessionId.value);
		expect(second.text).toMatch(RED);
	});
});
