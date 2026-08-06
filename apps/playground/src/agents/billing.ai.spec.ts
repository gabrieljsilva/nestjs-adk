import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import type { AdkTestBed } from "@nestjs-adk/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrderRepository } from "../aftersales/order.repository";
import { ApproveToolCallUseCase } from "../chat/approve-tool-call.use-case";
import { RejectToolCallUseCase } from "../chat/reject-tool-call.use-case";
import { aiStore, breathe, judge, storeGate } from "./ai-suite.fixture";
import { BillingAgent } from "./billing.agent";

const ORDER = "A-1042";

let bed: AdkTestBed;

/**
 * Money leaving, with a real model deciding to make it leave.
 *
 * The approval policy holds anything destructive, and `issue_refund` is the only tool the
 * store declares that way. What a fake cannot prove is that a provider asked to refund an
 * order actually calls it, which is the moment the policy has to be there.
 */
describe.runIf(storeGate.present)("AI: billing, and the human in front of the money", () => {
	beforeEach(breathe);

	afterEach(async () => {
		await bed?.close();
	});

	async function suspended() {
		bed = await aiStore().boot();
		const billing = bed.agent(BillingAgent);
		return { billing, run: await billing.ask(`Devolve os 349 reais do pedido ${ORDER}.`) };
	}

	function orders(): OrderRepository {
		return bed.get(OrderRepository);
	}

	it("stops in front of the human before any money leaves", { timeout: 120_000 }, async () => {
		const { run } = await suspended();

		expect(run).toAwaitApproval("issue_refund");
		expect(run).not.toHaveRunTool("issue_refund");
		expect(orders().findById(ORDER)?.isRefunded).toBe(false);
	});

	it("lets the money leave once a human said yes, and records it", { timeout: 120_000 }, async () => {
		const { run } = await suspended();

		const resumed = await bed
			.get(ApproveToolCallUseCase)
			.execute(run.sessionId.value, run.pendingCall("issue_refund").callId.value, "gerente@nebula.test");

		expect(resumed.status.name).toBe("completed");
		expect(bed.events.ran("issue_refund")).toBe(1);
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

		const resumed = await bed
			.get(RejectToolCallUseCase)
			.execute(
				run.sessionId.value,
				run.pendingCall("issue_refund").callId.value,
				"fora da janela de sete dias",
				"gerente@nebula.test",
			);

		expect(resumed.status.name).toBe("completed");
		expect(bed.events.denied("issue_refund")).toBe(1);
		expect(orders().findById(ORDER)?.isRefunded).toBe(false);
		expect(orders().findById(ORDER)?.refundedCents).toBe(0);
		expect(resumed.text.length).toBeGreaterThan(0);
	});

	it("reads the order through its own tool before talking about it", { timeout: 120_000 }, async () => {
		bed = await aiStore().boot();

		const run = await bed.agent(BillingAgent).ask(`Qual o valor e a situação do pedido ${ORDER}?`);

		expect(run).toHaveRunTool("find_order");
		expect(run.text).toContain("349");
	});

	/** The arguments are the assertion: a refund of the wrong amount is worse than no refund. */
	it("asks to refund the amount the order actually carries", { timeout: 120_000 }, async () => {
		const { run } = await suspended();

		expect(run.callsTo("issue_refund").at(0)?.args).toMatchObject({ orderId: ORDER });
	});

	it("says no to an order nobody placed, without calling the refund", { timeout: 120_000 }, async () => {
		bed = await aiStore().boot();

		const run = await bed.agent(BillingAgent).ask("Qual a situação do pedido A-9999?");

		expect(run).not.toHaveRunTool("issue_refund");
		expect(run.status.name).toBe("completed");
	});

	it("answers the ceiling of a plan through the tool that knows it", { timeout: 120_000 }, async () => {
		bed = await aiStore().boot();

		const run = await bed.agent(BillingAgent).ask("Qual o teto de reembolso do plano gold?");

		expect(run).toHaveRunTool("refund_limit");
		// The thousands separator is the model's choice, and it makes both spellings correct.
		expect(run.text).toMatch(/1\.?437/);
	});

	/** The wording moves every run, so the judge grades what the answer had to say. */
	it("explains that a refund needs a human, judged rather than matched", { timeout: 120_000 }, async () => {
		const { run } = await suspended();

		const resumed = await bed
			.get(RejectToolCallUseCase)
			.execute(run.sessionId.value, run.pendingCall("issue_refund").callId.value, "fora da janela", "gerente");

		await expect(resumed.text).toSatisfyRubric(judge(), "says the refund was not made, and gives a reason");
	});
});
