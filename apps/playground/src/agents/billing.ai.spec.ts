import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import type { AgentResult } from "@nestjs-adk/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrderRepository } from "../aftersales/order.repository";
import { ApproveToolCallUseCase } from "../chat/approve-tool-call.use-case";
import { RejectToolCallUseCase } from "../chat/reject-tool-call.use-case";
import { type AiStore, bootAi, breathe, storeKey, storeModel } from "./ai-suite.fixture";
import { BillingAgent } from "./billing.agent";

const apiKey = storeKey();
const ORDER = "A-1042";

/** The call a suspended run is waiting on, which is what a human answers about. */
function pending(result: AgentResult): string {
	const call = result.awaiting.at(0);
	if (call === undefined) throw new Error("the run is not waiting for anything");
	return call.callId.value;
}

/**
 * Money leaving, with a real model deciding to make it leave.
 *
 * The approval policy holds anything destructive, and `issue_refund` is the only tool the
 * store declares that way. What a fake cannot prove is that a provider asked to refund an
 * order actually calls it, which is the moment the policy has to be there.
 */
describe.runIf(apiKey)("AI: billing, and the human in front of the money", () => {
	let store: AiStore;

	beforeEach(breathe);

	afterEach(async () => {
		await store?.app.close();
	});

	async function suspended(): Promise<{ store: AiStore; run: AgentResult }> {
		if (apiKey === undefined) throw new Error("no api key");
		store = await bootAi(storeModel(apiKey));
		const run = await store.app.get(BillingAgent).ask(`Devolve os 349 reais do pedido ${ORDER}.`);
		return { store, run };
	}

	function orders(): OrderRepository {
		return store.app.get(OrderRepository);
	}

	it("stops in front of the human before any money leaves", { timeout: 120_000 }, async () => {
		const { run } = await suspended();

		expect(run).toAwaitApproval("issue_refund");
		expect(store.events.toolsRun).not.toContain("issue_refund");
		expect(orders().findById(ORDER)?.isRefunded).toBe(false);
	});

	it("lets the money leave once a human said yes, and records it", { timeout: 120_000 }, async () => {
		const { run } = await suspended();

		const resumed = await store.app
			.get(ApproveToolCallUseCase)
			.execute(run.sessionId.value, pending(run), "gerente@nebula.test");

		expect(resumed.status.name).toBe("completed");
		expect(store.events.ran("issue_refund")).toBe(1);
		expect(orders().findById(ORDER)?.refundedCents).toBe(34_900);
	});

	/**
	 * A refusal is an answer, so the call still produces a result the model reads.
	 *
	 * The assertion is the money and not the event: a denied call is journalled like any
	 * other, carrying the reason instead of a refund, which is exactly how the conversation
	 * carries on knowing what happened.
	 */
	it("keeps the money when a human said no, and the conversation carries on", { timeout: 120_000 }, async () => {
		const { run } = await suspended();

		const resumed = await store.app
			.get(RejectToolCallUseCase)
			.execute(run.sessionId.value, pending(run), "fora da janela de sete dias", "gerente@nebula.test");

		expect(resumed.status.name).toBe("completed");
		expect(store.events.countOf("tool.approval-denied")).toBe(1);
		expect(orders().findById(ORDER)?.isRefunded).toBe(false);
		expect(orders().findById(ORDER)?.refundedCents).toBe(0);
		expect(resumed.text.length).toBeGreaterThan(0);
	});

	it("reads the order through its own tool before talking about it", { timeout: 120_000 }, async () => {
		if (apiKey === undefined) throw new Error("no api key");
		store = await bootAi(storeModel(apiKey));

		const result = await store.app.get(BillingAgent).ask(`Qual o valor e a situação do pedido ${ORDER}?`);

		expect(store.events.toolsRun).toContain("find_order");
		expect(result.text).toContain("349");
	});
});
