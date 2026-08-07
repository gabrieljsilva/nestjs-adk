import { describe, expect, it } from "vitest";
import { Attachment } from "./attachment";
import { RecordingConcierge } from "./recording-concierge.fixture";
import { SendMessageUseCase } from "./send-message.use-case";

describe("SendMessageUseCase", () => {
	it("asks the agent exactly what the customer said", async () => {
		const concierge = new RecordingConcierge();
		const messages = new SendMessageUseCase(concierge);

		await messages.execute("my controller arrived broken");

		expect(concierge.asked).toEqual(["my controller arrived broken"]);
	});

	it("continues the conversation it was given", async () => {
		const concierge = new RecordingConcierge();
		const messages = new SendMessageUseCase(concierge);

		await messages.execute("what about the refund?", "session-9");

		expect(concierge.lastOptions.sessionId).toBe("session-9");
	});

	it("starts a new conversation when no session was named", async () => {
		const concierge = new RecordingConcierge();
		const messages = new SendMessageUseCase(concierge);

		await messages.execute("hello");

		expect(concierge.lastOptions.sessionId).toBeUndefined();
	});

	it("attaches nothing when the message came alone", async () => {
		const concierge = new RecordingConcierge();
		const messages = new SendMessageUseCase(concierge);

		await messages.execute("hello", undefined, []);

		expect(concierge.lastOptions.media).toEqual([]);
	});

	it("hands every attachment to the model, in the order they came", async () => {
		const concierge = new RecordingConcierge();
		const messages = new SendMessageUseCase(concierge);

		await messages.execute("it arrived like this", undefined, [
			Attachment.of("https://files.example.test/broken-controller.jpg", "image/jpeg"),
			Attachment.of("https://files.example.test/caixa-amassada.png", "image/png"),
		]);

		const media = concierge.lastOptions.media ?? [];
		expect(media.map((part) => part.url)).toEqual([
			"https://files.example.test/broken-controller.jpg",
			"https://files.example.test/caixa-amassada.png",
		]);
		expect(media.map((part) => part.mediaType)).toEqual(["image/jpeg", "image/png"]);
	});

	/**
	 * The words are the customer's words.
	 *
	 * Nothing about the attachments is written into the prompt: a tool that has to know
	 * which conversation a file arrived in reads the session out of its `ToolContext`, so
	 * the model is never asked to copy an address it cannot see anyway.
	 */
	it("says exactly what the customer typed, attachments included", async () => {
		const concierge = new RecordingConcierge();
		const messages = new SendMessageUseCase(concierge);

		await messages.execute("it arrived like this", undefined, [
			Attachment.of("https://files.example.test/broken-controller.jpg", "image/jpeg"),
		]);

		expect(concierge.asked).toEqual(["it arrived like this"]);
	});

	it("answers what the agent answered", async () => {
		const concierge = new RecordingConcierge();
		const messages = new SendMessageUseCase(concierge);

		expect((await messages.execute("hello")).text).toBe("answered");
	});

	/** The request going away has to reach the run, or the store pays for the rest of it. */
	it("hands the caller's signal to the agent", async () => {
		const concierge = new RecordingConcierge();
		const messages = new SendMessageUseCase(concierge);
		const controller = new AbortController();

		await messages.execute("tell me everything", undefined, [], controller.signal);

		expect(concierge.lastOptions.signal).toBe(controller.signal);
	});

	it("asks without one when nobody is waiting to cancel", async () => {
		const concierge = new RecordingConcierge();
		const messages = new SendMessageUseCase(concierge);

		await messages.execute("hello");

		expect(concierge.lastOptions.signal).toBeUndefined();
	});
});
