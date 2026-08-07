import { UnsupportedMediaTypeError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { ApproveToolCallUseCase } from "./approve-tool-call.use-case";
import { ChatController } from "./chat.controller";
import { InvalidAttachmentError } from "./errors/invalid-attachment.error";
import { InspectSessionUseCase } from "./inspect-session.use-case";
import { RecordingConcierge } from "./recording-concierge.fixture";
import { RejectToolCallUseCase } from "./reject-tool-call.use-case";
import { SendMessageUseCase } from "./send-message.use-case";

describe("ChatController", () => {
	it("sends a message with nothing attached as words alone", async () => {
		const concierge = new RecordingConcierge();
		const controller = new ChatController(
			new SendMessageUseCase(concierge),
			new ApproveToolCallUseCase(concierge),
			new RejectToolCallUseCase(concierge),
			new InspectSessionUseCase(concierge),
		);

		await controller.send("how much does Elden Ring Nightreign cost?");

		expect(concierge.lastOptions.media).toEqual([]);
	});

	it("reads the attachments out of the body, more than one when there is more than one", async () => {
		const concierge = new RecordingConcierge();
		const controller = new ChatController(
			new SendMessageUseCase(concierge),
			new ApproveToolCallUseCase(concierge),
			new RejectToolCallUseCase(concierge),
			new InspectSessionUseCase(concierge),
		);

		await controller.send("it arrived broken", "session-9", [
			{ url: "https://files.example.test/broken-controller.jpg", mediaType: "image/jpeg" },
			{ url: "https://files.example.test/caixa-amassada.png", mediaType: "image/png" },
		]);

		expect(concierge.lastOptions.media?.map((part) => part.url)).toEqual([
			"https://files.example.test/broken-controller.jpg",
			"https://files.example.test/caixa-amassada.png",
		]);
		expect(concierge.lastOptions.sessionId).toBe("session-9");
	});

	/**
	 * The store takes any file; the runtime, today, takes pictures.
	 *
	 * `MediaPart` supports `png`, `jpeg`, `gif` and `webp`, so a receipt in PDF is accepted
	 * at the boundary and refused when it becomes media. This test is here to say so out
	 * loud: it is the shape of the limitation, and it flips the day the runtime grows.
	 */
	it("is refused by the runtime when the file is not a picture", () => {
		const concierge = new RecordingConcierge();
		const controller = new ChatController(
			new SendMessageUseCase(concierge),
			new ApproveToolCallUseCase(concierge),
			new RejectToolCallUseCase(concierge),
			new InspectSessionUseCase(concierge),
		);

		expect(() =>
			controller.send("here is the receipt", undefined, [
				{ url: "https://files.example.test/invoice.pdf", mediaType: "application/pdf" },
			]),
		).toThrow(UnsupportedMediaTypeError);
	});

	it("refuses a body that says it has attachments and does not", () => {
		const concierge = new RecordingConcierge();
		const controller = new ChatController(
			new SendMessageUseCase(concierge),
			new ApproveToolCallUseCase(concierge),
			new RejectToolCallUseCase(concierge),
			new InspectSessionUseCase(concierge),
		);

		expect(() =>
			controller.send("it arrived broken", undefined, [{ url: "https://files.example.test/broken-controller.jpg" }]),
		).toThrow(InvalidAttachmentError);
	});

	it("passes a decision straight through", async () => {
		const concierge = new RecordingConcierge();
		const controller = new ChatController(
			new SendMessageUseCase(concierge),
			new ApproveToolCallUseCase(concierge),
			new RejectToolCallUseCase(concierge),
			new InspectSessionUseCase(concierge),
		);

		await controller.approve("session-9", "call-1", "manager");
		await controller.reject("session-9", "call-2", "too expensive", "manager");

		expect(concierge.decided).toEqual([
			"approve:session-9:call-1:manager",
			"reject:session-9:call-2:too expensive:manager",
		]);
	});

	it("reads a session by its id", async () => {
		const concierge = new RecordingConcierge();
		const controller = new ChatController(
			new SendMessageUseCase(concierge),
			new ApproveToolCallUseCase(concierge),
			new RejectToolCallUseCase(concierge),
			new InspectSessionUseCase(concierge),
		);

		await expect(controller.session("session-9")).rejects.toThrow("no runtime behind this agent");

		expect(concierge.inspected).toBe("session-9");
	});
});
