import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import { MediaPart, SessionStorage, SqliteConnection, SqliteSessionStorage } from "@nestjs-adk/core";
import { type AdkTestBed, AdkTestBedBuilder, RunTranscript, TestImage } from "@nestjs-adk/testing";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { TicketRepository } from "../../aftersales/ticket.repository";
import { AppModule } from "../../app.module";
import { InspectSessionUseCase } from "../../chat/inspect-session.use-case";
import { StoreDatabase } from "../../shared/store-database";
import { judge, openAILuna } from "../../testing/models";
import { WarrantyAgent } from "../warranty/warranty.agent";

/**
 * The sector a broken product reaches, with a model that actually looks at the photo.
 *
 * Two things are only true against a provider: that the image this application attaches
 * arrives in a shape the provider decodes, and that the model asked to open a ticket fills
 * the reason with what it saw rather than with the customer's words. The ticket lands in
 * SQLite either way, which is what makes the assertion cheap.
 */
describe("AI: warranty, a photo and the sector next door", () => {
	it("opens the ticket from a photo it fetched from a link", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed.agent(WarrantyAgent).ask("My controller from order A-1042 arrived like this. Open a ticket.", {
			media: [
				MediaPart.link(
					"https://files.meiobit.com/wp-content/uploads/2015/06/20150629broken-controller-620x462.jpg",
					"image/jpeg",
				),
			],
		});

		expect(run).toHaveRunTool("open_ticket");
		expect(run.callsTo("open_ticket").at(0)?.args).toMatchObject({ orderId: "A-1042" });
		const ticket = bed.get(TicketRepository).findByOrder("A-1042").at(0);
		expect(ticket?.sessionId).toBe(run.sessionId.value);
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
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const image = TestImage.red();
		const run = await bed
			.agent(WarrantyAgent)
			.ask("What is the predominant color in this product photo? Answer with one word.", {
				media: [MediaPart.image(image.mediaType, image.toBase64())],
			});

		expect(run.text).toMatch(/red/i);
	});

	it("still has the photo on the next turn, without it being sent again", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();
		const warranty = bed.agent(WarrantyAgent);
		const first = await warranty.ask("Remember this photo of my product.", {
			media: [MediaPart.link("https://placehold.co/240x240/ff0000/ff0000.png", "image/png")],
		});

		const second = await warranty.ask("What was the color of the photo I sent? Answer with one word.");

		expect(second.sessionId.value).toBe(first.sessionId.value);
		expect(second.text).toMatch(/red/i);
	});

	/**
	 * Delegation, which is not a handover.
	 *
	 * The ceiling of a plan is one question the financial sector owns and the warranty
	 * sector asks. The conversation stays here: a customer talking about a broken product
	 * is not suddenly talking to billing because a number came from there.
	 */
	it("asks billing one question and stays the sector in charge", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed.agent(WarrantyAgent).ask("How much can the gold plan receive back?");
		const session = await bed.get(InspectSessionUseCase).execute(run.sessionId.value);

		expect(run).toHaveDelegatedTo("billing");
		expect(run.events.types).toContain("delegation.completed");
		expect(session.activeAgent.value).toBe("warranty");
		expect(run.text).toMatch(/1[.,]?437/);
	});

	/**
	 * A ticket is a record somebody will read, so a greeting must not become one.
	 *
	 * Asked to open a ticket for a product it cannot see, this sector asks for the picture
	 * first, which is it behaving well. What has to hold either way is that nothing was
	 * written down.
	 */
	it("writes nothing down for a question that is not a complaint", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed.agent(WarrantyAgent).ask("Hello! Are you open on Saturdays?");

		expect(run).not.toHaveRunTool("open_ticket");
		expect(bed.get(TicketRepository).findByOrder("A-1042")).toEqual([]);
	});

	it("refuses to open a ticket for an order the store never sold", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed.agent(WarrantyAgent).ask("Open a ticket for order A-9999: it arrived broken.");

		expect(run).toHaveStatus("completed");
		expect(bed.get(TicketRepository).findByOrder("A-9999")).toEqual([]);
	});

	/** A skill that is not always on is knowledge the model has to ask for. */
	it("answers a policy question, judged rather than matched", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed.agent(WarrantyAgent).ask("What is the store warranty period? Answer in one sentence.");

		await expect(run.text).toSatisfyRubric(judge, "states a warranty period in days or months");
	});
});
