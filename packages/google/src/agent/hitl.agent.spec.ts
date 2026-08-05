import {
	AdkRuntimeHost,
	AgentName,
	AgentRunCommand,
	ApproveInput,
	AskInput,
	EffectApprovalPolicy,
	InMemoryArtifactStorage,
	InMemorySessionStorage,
	RejectInput,
	RunLimits,
	RuntimeOptions,
	ShutdownOptions,
	ToolDefinition,
	ToolEffect,
	ToolHandler,
	ZodToolSchema,
} from "@nestjs-adk/core/native";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { agentOf, apiKeyFromEnvironment, toolModel } from "./agent-suite.fixture";
import { RandomIdGenerator } from "./random-id-generator.fixture";
import { SystemClock } from "./system-clock.fixture";

const apiKey = apiKeyFromEnvironment();
const SUPPORT = AgentName.from("support");

/** A write nobody should run without an answer from a human. */
class RefundHandler extends ToolHandler {
	public calls = 0;

	public async invoke(args: Record<string, unknown>): Promise<unknown> {
		this.calls += 1;
		return { orderId: args.orderId, refunded: true };
	}
}

function refundTool(handler: ToolHandler): ToolDefinition {
	return new ToolDefinition(
		"refund_order",
		"Refunds an order.",
		ZodToolSchema.of(z.object({ orderId: z.string().describe("The order to refund") })),
		ToolEffect.WRITE,
		handler,
	);
}

function holdingWrites(): RuntimeOptions {
	return new RuntimeOptions(
		ShutdownOptions.waitIndefinitely(),
		RunLimits.none(),
		[],
		undefined,
		EffectApprovalPolicy.from(ToolEffect.WRITE),
	);
}

describe.runIf(apiKey)("AGENT: human in the loop over real Gemini", () => {
	const host = new AdkRuntimeHost();

	afterEach(async () => {
		await host.stop();
	});

	async function startWith(handler: RefundHandler): Promise<AdkRuntimeHost> {
		if (apiKey === undefined) throw new Error("no api key");
		await host.start(
			[agentOf(SUPPORT, "Use the tools to do what you are asked.", toolModel(apiKey), [refundTool(handler)])],
			new InMemorySessionStorage(),
			new InMemoryArtifactStorage(new RandomIdGenerator()),
			new SystemClock(),
			new RandomIdGenerator(),
			holdingWrites(),
		);
		return host;
	}

	it("stops in front of the human, and runs the call once the human says yes", { timeout: 90_000 }, async () => {
		const handler = new RefundHandler();
		const started = await startWith(handler);

		const suspended = await started.runtime.runner.ask(
			new AgentRunCommand(SUPPORT, AskInput.of("Refund order 42, please.")),
		);

		expect(suspended.status.name).toBe("suspended");
		expect(suspended.isAwaitingApproval).toBe(true);
		expect(handler.calls).toBe(0);

		const held = suspended.awaiting[0];
		expect(held?.toolName).toBe("refund_order");

		// The human, simulated: somebody reads what is waiting and answers it.
		const inspection = await started.runtime.sessions.handle(suspended.sessionId);
		expect(inspection.isAwaitingApproval).toBe(true);
		expect(inspection.approval.awaiting[0]?.callId.value).toBe(held?.callId.value);

		const waiting = inspection.approval.awaiting[0];
		if (waiting === undefined) throw new Error("nothing is waiting for a decision");
		const resumed = await started.runtime.runner.approve(ApproveInput.of(suspended.sessionId, waiting.callId, "a-human"));

		expect(handler.calls).toBe(1);
		expect(resumed.status.name).toBe("completed");
		expect((await started.runtime.sessions.handle(suspended.sessionId)).isAwaitingApproval).toBe(false);
	});

	it("never runs the call when the human says no", { timeout: 90_000 }, async () => {
		const handler = new RefundHandler();
		const started = await startWith(handler);

		const suspended = await started.runtime.runner.ask(
			new AgentRunCommand(SUPPORT, AskInput.of("Refund order 42, please.")),
		);
		const held = suspended.awaiting[0];

		if (held === undefined) throw new Error("nothing is waiting for a decision");
		const answered = await started.runtime.runner.reject(
			RejectInput.of(suspended.sessionId, held.callId, "the order is outside the refund window", "a-human"),
		);

		expect(handler.calls).toBe(0);
		expect(answered.status.name).toBe("completed");
	});
});
