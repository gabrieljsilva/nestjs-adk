import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import { MediaPart } from "@nestjs-adk/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TicketRepository } from "../aftersales/ticket.repository";
import { InspectSessionUseCase } from "../chat/inspect-session.use-case";
import { type AiStore, HOSTED_RED, bootAi, breathe, redSquare, storeKey, storeModel } from "./ai-suite.fixture";
import { WarrantyAgent } from "./warranty.agent";

const apiKey = storeKey();
const ORDER = "A-1042";

/** The photo a customer would send: a controller that arrived broken. */
const BROKEN_CONTROLLER = "https://files.meiobit.com/wp-content/uploads/2015/06/20150629broken-controller-620x462.jpg";

const RED = /vermelh/i;

/**
 * The sector a broken product reaches, with a model that actually looks at the photo.
 *
 * Two things are only true against a provider: that the image this application attaches
 * arrives in a shape the provider decodes, and that the model asked to open a ticket fills
 * the reason with what it saw rather than with the customer's words. The ticket lands in
 * SQLite either way, which is what makes the assertion cheap.
 */
describe.runIf(apiKey)("AI: warranty, a photo and the sector next door", () => {
	let store: AiStore;

	beforeEach(breathe);

	afterEach(async () => {
		await store?.app.close();
	});

	async function booted(): Promise<AiStore> {
		if (apiKey === undefined) throw new Error("no api key");
		store = await bootAi(storeModel(apiKey));
		return store;
	}

	it("opens the ticket from a photo it fetched from a link", { timeout: 120_000 }, async () => {
		const { app, events } = await booted();

		const result = await app.get(WarrantyAgent).ask(`Meu controle do pedido ${ORDER} chegou assim. Abre o chamado.`, {
			media: [MediaPart.link(BROKEN_CONTROLLER, "image/jpeg")],
		});

		expect(events.toolsRun).toContain("open_ticket");
		const ticket = app.get(TicketRepository).findByOrder(ORDER).at(0);
		expect(ticket?.sessionId).toBe(result.sessionId.value);
		expect(ticket?.reason.length).toBeGreaterThan(0);
	});

	/**
	 * The same question with the bytes in the message instead of an address.
	 *
	 * A client that just took the picture has the file and nowhere to point at, so the
	 * store takes base64 too. One flat colour is the smallest image with an answer nobody
	 * can get right by guessing.
	 */
	it("looks at bytes that came in the message, with nothing hosted anywhere", { timeout: 120_000 }, async () => {
		const { app } = await booted();

		const result = await app
			.get(WarrantyAgent)
			.ask("Qual é a cor predominante nesta foto do meu produto? Responda em uma palavra.", {
				media: [redSquare()],
			});

		expect(result.text).toMatch(RED);
	});

	it("still has the photo on the next turn, without it being sent again", { timeout: 120_000 }, async () => {
		const { app } = await booted();
		const first = await app
			.get(WarrantyAgent)
			.ask("Guarde esta foto do meu produto.", { media: [MediaPart.link(HOSTED_RED, "image/png")] });

		const second = await app
			.get(WarrantyAgent)
			.ask("Qual era a cor da foto que eu enviei? Responda em uma palavra.", { sessionId: first.sessionId });

		expect(second.sessionId.value).toBe(first.sessionId.value);
		expect(second.text).toMatch(RED);
	});

	/**
	 * Delegation, which is not a handover.
	 *
	 * The ceiling of a plan is one question the financial sector owns and the warranty
	 * sector asks. The conversation stays here: a customer talking about a broken product
	 * is not suddenly talking to billing because a number came from there.
	 */
	it("asks billing one question and stays the sector in charge", { timeout: 120_000 }, async () => {
		const { app, events } = await booted();

		const result = await app.get(WarrantyAgent).ask("Quanto o plano gold pode receber de volta?");
		const session = await app.get(InspectSessionUseCase).execute(result.sessionId.value);

		expect(events.types).toContain("delegation.started");
		expect(events.types).toContain("delegation.completed");
		expect(session.activeAgent.value).toBe("warranty");
		expect(result.text).toMatch(/1\.?437/);
	});
});
