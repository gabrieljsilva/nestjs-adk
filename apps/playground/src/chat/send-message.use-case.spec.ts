import { beforeEach, describe, expect, it } from "vitest";
import { Attachment } from "./attachment";
import { RecordingConcierge } from "./recording-concierge.fixture";
import { SendMessageUseCase } from "./send-message.use-case";

const PHOTO = "https://files.example.test/controle-quebrado.jpg";
const OTHER_PHOTO = "https://files.example.test/caixa-amassada.png";

let concierge: RecordingConcierge;
let messages: SendMessageUseCase;

beforeEach(() => {
	concierge = new RecordingConcierge();
	messages = new SendMessageUseCase(concierge);
});

describe("SendMessageUseCase", () => {
	it("asks the agent exactly what the customer said", async () => {
		await messages.execute("meu controle chegou quebrado");

		expect(concierge.asked).toEqual(["meu controle chegou quebrado"]);
	});

	it("continues the conversation it was given", async () => {
		await messages.execute("e o reembolso?", "session-9");

		expect(concierge.lastOptions.sessionId).toBe("session-9");
	});

	it("starts a new conversation when no session was named", async () => {
		await messages.execute("oi");

		expect(concierge.lastOptions.sessionId).toBeUndefined();
	});

	it("attaches nothing when the message came alone", async () => {
		await messages.execute("oi", undefined, []);

		expect(concierge.lastOptions.media).toEqual([]);
	});

	it("hands every attachment to the model, in the order they came", async () => {
		await messages.execute("chegou assim", undefined, [
			Attachment.of(PHOTO, "image/jpeg"),
			Attachment.of(OTHER_PHOTO, "image/png"),
		]);

		const media = concierge.lastOptions.media ?? [];
		expect(media.map((part) => part.url)).toEqual([PHOTO, OTHER_PHOTO]);
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
		await messages.execute("chegou assim", undefined, [Attachment.of(PHOTO, "image/jpeg")]);

		expect(concierge.asked).toEqual(["chegou assim"]);
	});

	it("answers what the agent answered", async () => {
		expect((await messages.execute("oi")).text).toBe("respondido");
	});
});
