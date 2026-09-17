import { describe, expect, it } from "vitest";
import { ModelCapabilities } from "./model-capabilities";
import { ModelContextWindow } from "./model-context-window";
import { ModelDescriptor } from "./model-descriptor";
import { ModelIdentity } from "./model-identity";
import { UnknownContextWindow } from "./unknown-context-window";

const IDENTITY = ModelIdentity.of("google", "gemini-flash");

describe("ModelDescriptor", () => {
	it("answers identity, window and capabilities without calling the provider", () => {
		const descriptor = new ModelDescriptor(IDENTITY, ModelContextWindow.of(1000, 100), ModelCapabilities.none());

		expect(descriptor.identity.toString()).toBe("google/gemini-flash");
		expect(descriptor.contextWindow.isKnown).toBe(true);
	});

	it("accepts an unknown window, so an adapter never has to invent a number", () => {
		const descriptor = new ModelDescriptor(IDENTITY, new UnknownContextWindow(), ModelCapabilities.none());

		expect(descriptor.contextWindow.isKnown).toBe(false);
	});
});
