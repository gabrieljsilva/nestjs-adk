import { UnsupportedMediaTypeError } from "@nestjs-adk/core";
import { beforeEach, describe, expect, it } from "vitest";
import { ApproveToolCallUseCase } from "./approve-tool-call.use-case";
import { ChatController } from "./chat.controller";
import { InvalidAttachmentError } from "./errors/invalid-attachment.error";
import { InspectSessionUseCase } from "./inspect-session.use-case";
import { RecordingConcierge } from "./recording-concierge.fixture";
import { RejectToolCallUseCase } from "./reject-tool-call.use-case";
import { SendMessageUseCase } from "./send-message.use-case";

const PHOTO = "https://files.example.test/controle-quebrado.jpg";
const OTHER_PHOTO = "https://files.example.test/caixa-amassada.png";
const RECEIPT = "https://files.example.test/nota.pdf";

let concierge: RecordingConcierge;
let controller: ChatController;

beforeEach(() => {
	concierge = new RecordingConcierge();
	controller = new ChatController(
		new SendMessageUseCase(concierge),
		new ApproveToolCallUseCase(concierge),
		new RejectToolCallUseCase(concierge),
		new InspectSessionUseCase(concierge),
	);
});

describe("ChatController", () => {
	it("sends a message with nothing attached as words alone", async () => {
		await controller.send("quanto custa Elden Ring Nightreign?");

		expect(concierge.lastOptions.media).toEqual([]);
	});

	it("reads the attachments out of the body, more than one when there is more than one", async () => {
		await controller.send("chegou quebrado", "session-9", [
			{ url: PHOTO, mediaType: "image/jpeg" },
			{ url: OTHER_PHOTO, mediaType: "image/png" },
		]);

		expect(concierge.lastOptions.media?.map((part) => part.url)).toEqual([PHOTO, OTHER_PHOTO]);
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
		expect(() => controller.send("segue a nota", undefined, [{ url: RECEIPT, mediaType: "application/pdf" }])).toThrow(
			UnsupportedMediaTypeError,
		);
	});

	it("refuses a body that says it has attachments and does not", () => {
		expect(() => controller.send("chegou quebrado", undefined, [{ url: PHOTO }])).toThrow(InvalidAttachmentError);
	});

	it("passes a decision straight through", async () => {
		await controller.approve("session-9", "call-1", "gerente");
		await controller.reject("session-9", "call-2", "caro demais", "gerente");

		expect(concierge.decided).toEqual([
			"approve:session-9:call-1:gerente",
			"reject:session-9:call-2:caro demais:gerente",
		]);
	});

	it("reads a session by its id", async () => {
		await expect(controller.session("session-9")).rejects.toThrow("no runtime behind this agent");

		expect(concierge.inspected).toBe("session-9");
	});
});
