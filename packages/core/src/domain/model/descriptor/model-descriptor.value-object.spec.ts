import { describe, expect, it } from "vitest";
import { ModelCapabilities } from "./model-capabilities.value-object";
import { ModelContextWindow } from "./model-context-window.value-object";
import { ModelDescriptor } from "./model-descriptor.value-object";
import { ModelIdentity } from "./model-identity.value-object";
import { UnknownContextWindow } from "./unknown-context-window.value-object";

const IDENTITY = new ModelIdentity("google", "gemini-flash");

describe("ModelDescriptor", () => {
	it("answers identity, window and capabilities without calling the provider", () => {
		const descriptor = new ModelDescriptor(IDENTITY, new ModelContextWindow(1000, 100), ModelCapabilities.none());

		expect(descriptor.identity.toString()).toBe("google/gemini-flash");
		expect(descriptor.contextWindow.isKnown).toBe(true);
	});

	it("accepts an unknown window, so an adapter never has to invent a number", () => {
		const descriptor = new ModelDescriptor(IDENTITY, new UnknownContextWindow(), ModelCapabilities.none());

		expect(descriptor.contextWindow.isKnown).toBe(false);
	});
});
