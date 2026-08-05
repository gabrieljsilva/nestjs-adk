import { describe, expect, it } from "vitest";
import { AssistantMessage } from "../../domain/model/assistant-message";
import { MediaPart } from "../../domain/model/media-part";
import { ModelCapabilities } from "../../domain/model/model-capabilities";
import { ModelCapability } from "../../domain/model/model-capability";
import { ModelContextWindow } from "../../domain/model/model-context-window";
import { ModelDescriptor } from "../../domain/model/model-descriptor";
import { ModelIdentity } from "../../domain/model/model-identity";
import { ModelRequest } from "../../domain/model/model-request";
import { UserMessage } from "../../domain/model/user-message";
import { MediaFit } from "./media-fit";

const PIXEL = "iVBORw0KGgo=";

function descriptorOf(seesImages: boolean): ModelDescriptor {
	return new ModelDescriptor(
		ModelIdentity.of("acme", "m-1"),
		ModelContextWindow.of(1000, 100),
		ModelCapabilities.of([[ModelCapability.MEDIA_INPUT, seesImages]]),
	);
}

function requestWithImage(): ModelRequest {
	return new ModelRequest([
		new UserMessage("what is this?", [MediaPart.image("image/png", PIXEL)]),
		new AssistantMessage("a picture"),
	]);
}

describe("MediaFit", () => {
	it("leaves a request alone when the model can see", () => {
		const request = requestWithImage();

		expect(new MediaFit().fit(request, descriptorOf(true))).toBe(request);
	});

	it("leaves a request without media alone, whatever the model declares", () => {
		const request = new ModelRequest([new UserMessage("hello")]);

		expect(new MediaFit().fit(request, descriptorOf(false))).toBe(request);
	});

	it("keeps the words and says an image was there when the model cannot see", () => {
		const fitted = new MediaFit().fit(requestWithImage(), descriptorOf(false));
		const first = fitted.messages[0];

		expect(fitted.hasMedia).toBe(false);
		expect(first?.text).toContain("what is this?");
		expect(first?.text).toContain("cannot see images");
	});

	it("says it once per image, so a message with two loses two", () => {
		const request = new ModelRequest([
			new UserMessage("compare", [MediaPart.image("image/png", PIXEL), MediaPart.image("image/png", PIXEL)]),
		]);

		const text = new MediaFit().fit(request, descriptorOf(false)).messages[0]?.text ?? "";

		expect(text.split("cannot see images")).toHaveLength(3);
	});

	it("leaves every other message exactly as it was", () => {
		const fitted = new MediaFit().fit(requestWithImage(), descriptorOf(false));

		expect(fitted.messages[1]).toBeInstanceOf(AssistantMessage);
		expect(fitted.messages[1]?.text).toBe("a picture");
	});

	it("carries the tools, the instructions and the schema through untouched", () => {
		const request = new ModelRequest(
			[new UserMessage("what is this?", [MediaPart.image("image/png", PIXEL)])],
			[],
			undefined,
			{ type: "object" },
		);

		const fitted = new MediaFit().fit(request, descriptorOf(false));

		expect(fitted.wantsStructuredOutput).toBe(true);
		expect(fitted.outputSchema).toBe(request.outputSchema);
	});
});
