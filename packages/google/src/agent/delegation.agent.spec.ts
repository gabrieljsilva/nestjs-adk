import {
	AdkRuntimeHost,
	AgentDelegationPolicy,
	AgentExecutionPolicies,
	AgentName,
	AgentRunCommand,
	AskInput,
	DelegateInput,
	InMemoryArtifactStorage,
	InMemorySessionStorage,
	ToolDefinition,
	ToolEffect,
	ToolHandler,
	ZodToolSchema,
} from "@nestjs-adk/core";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { agentOf, apiKeyFromEnvironment, toolModel } from "./agent-suite.fixture";
import { RandomIdGenerator } from "./random-id-generator.fixture";
import { SystemClock } from "./system-clock.fixture";

const apiKey = apiKeyFromEnvironment();
const SUPPORT = AgentName.from("support");
const RESEARCHER = AgentName.from("researcher");

/** Only the specialist can reach this, so an answer carrying the number proves it ran. */
class PolicyHandler extends ToolHandler {
	public calls = 0;

	public async invoke(): Promise<unknown> {
		this.calls += 1;
		return { refundWindowDays: 137 };
	}
}

function policyTool(handler: ToolHandler): ToolDefinition {
	return new ToolDefinition(
		"refund_policy",
		"Answers the refund window, in days.",
		ZodToolSchema.of(z.object({})),
		ToolEffect.READ,
		handler,
	);
}

describe.runIf(apiKey)("AGENT: delegation over real Gemini", () => {
	const host = new AdkRuntimeHost();
	const handler = new PolicyHandler();

	afterEach(async () => {
		await host.stop();
	});

	async function started(): Promise<AdkRuntimeHost> {
		if (apiKey === undefined) throw new Error("no api key");
		await host.start(
			[
				agentOf(
					SUPPORT,
					"You never know policy details yourself. Delegate any policy question to researcher, then answer with what it said.",
					toolModel(apiKey),
					[],
					AgentExecutionPolicies.of(undefined, undefined, undefined, undefined, AgentDelegationPolicy.to([RESEARCHER])),
				),
				agentOf(RESEARCHER, "Answer using the tools, with the number only.", toolModel(apiKey), [policyTool(handler)]),
			],
			new InMemorySessionStorage(),
			new InMemoryArtifactStorage(new RandomIdGenerator()),
			new SystemClock(),
			new RandomIdGenerator(),
		);
		return host;
	}

	it("has the specialist answer, and keeps the conversation where it was", { timeout: 120_000 }, async () => {
		const runtime = (await started()).runtime;

		const result = await runtime.runner.ask(
			new AgentRunCommand(SUPPORT, AskInput.of("Quantos dias tenho para pedir reembolso?")),
		);

		const inspection = await runtime.sessions.handle(result.sessionId);
		expect(handler.calls).toBeGreaterThan(0);
		expect(result.text).toContain("137");
		expect(inspection.activeAgent.value).toBe("support");
	});

	it("delegates by code on a session that already exists", { timeout: 120_000 }, async () => {
		const runtime = (await started()).runtime;
		const opening = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("Oi")));

		const answer = await runtime.runner.delegate(
			new DelegateInput(opening.sessionId, SUPPORT, RESEARCHER, "Quantos dias dura a janela de reembolso?"),
		);

		const inspection = await runtime.sessions.handle(opening.sessionId);
		expect(answer.text).toContain("137");
		expect(inspection.activeAgent.value).toBe("support");
	});
});
