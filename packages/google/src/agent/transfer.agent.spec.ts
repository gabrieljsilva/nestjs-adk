import {
	AdkRuntimeHost,
	AgentExecutionPolicies,
	AgentName,
	AgentRunCommand,
	AgentTransferPolicy,
	AskInput,
	InMemoryArtifactStorage,
	InMemorySessionStorage,
	RunLimits,
} from "@nestjs-adk/core/native";
import { afterEach, describe, expect, it } from "vitest";
import { agentOf, apiKeyFromEnvironment, cheapModel, toolModel } from "./agent-suite.fixture";
import { RandomIdGenerator } from "./random-id-generator.fixture";
import { SystemClock } from "./system-clock.fixture";

const apiKey = apiKeyFromEnvironment();
const SUPPORT = AgentName.from("support");
const BILLING = AgentName.from("billing");

describe.runIf(apiKey)("AGENT: transfer over real Gemini", () => {
	const host = new AdkRuntimeHost();

	afterEach(async () => {
		await host.stop();
	});

	async function started(): Promise<AdkRuntimeHost> {
		if (apiKey === undefined) throw new Error("no api key");
		await host.start(
			[
				agentOf(
					SUPPORT,
					"You only answer opening hours. Anything about money or invoices belongs to billing: transfer it.",
					toolModel(apiKey),
					[],
					AgentExecutionPolicies.of(undefined, undefined, undefined, AgentTransferPolicy.to([BILLING])),
				),
				agentOf(BILLING, "You handle money questions. Start your answer with the word BILLING.", cheapModel(apiKey)),
			],
			new InMemorySessionStorage(),
			new InMemoryArtifactStorage(new RandomIdGenerator()),
			new SystemClock(),
			new RandomIdGenerator(),
		);
		return host;
	}

	it("lets the model hand the session over, and billing answers", { timeout: 90_000 }, async () => {
		const runtime = (await started()).runtime;

		const result = await runtime.runner.ask(
			new AgentRunCommand(SUPPORT, AskInput.of("Fui cobrado duas vezes na fatura. Resolve isso?")),
		);

		const inspection = await runtime.sessions.handle(result.sessionId);
		expect(inspection.activeAgent.value).toBe("billing");
		expect(result.text.length).toBeGreaterThan(0);
	});

	it("hands the session over by code, through the same declared edge", { timeout: 90_000 }, async () => {
		const runtime = (await started()).runtime;
		const opening = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("Que horas vocês abrem?")));

		const routed = await runtime.runner.ask(
			new AgentRunCommand(
				SUPPORT,
				AskInput.of("E sobre a minha fatura?", opening.sessionId),
				RunLimits.none(),
				undefined,
				undefined,
				undefined,
				BILLING,
			),
		);

		const inspection = await runtime.sessions.handle(opening.sessionId);
		expect(routed.sessionId.value).toBe(opening.sessionId.value);
		expect(inspection.activeAgent.value).toBe("billing");
		expect(routed.text.toUpperCase()).toContain("BILLING");
	});
});
