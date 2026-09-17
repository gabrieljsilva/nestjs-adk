import { describe, expect, it } from "vitest";
import { signsFunctionCalls } from "./gemini-generation";

describe("signsFunctionCalls", () => {
	it("says yes for the models this repository runs against", () => {
		expect(signsFunctionCalls("gemini-3.5-flash-lite")).toBe(true);
		expect(signsFunctionCalls("gemini-3-pro-preview")).toBe(true);
		expect(signsFunctionCalls("gemini-3.6-flash")).toBe(true);
	});

	it("says no for the generation that signs nothing", () => {
		expect(signsFunctionCalls("gemini-2.5-flash")).toBe(false);
		expect(signsFunctionCalls("gemini-2.5-flash-lite")).toBe(false);
	});

	/** Vertex and the Files API both hand model names back with a prefix on them. */
	it("reads the generation through a path prefix", () => {
		expect(signsFunctionCalls("models/gemini-3.5-flash-lite")).toBe(true);
		expect(signsFunctionCalls("models/gemini-2.5-flash")).toBe(false);
	});

	/** Vertex names a model by its full resource path, and the generation is still the last segment. */
	it("reads the generation through a Vertex resource name", () => {
		expect(signsFunctionCalls("projects/acme/locations/us-central1/publishers/google/models/gemini-3-pro")).toBe(true);
		expect(signsFunctionCalls("projects/acme/locations/us-central1/publishers/google/models/gemini-2.5-flash")).toBe(
			false,
		);
	});

	/**
	 * The aliases Google publishes move, and they move forward.
	 *
	 * Measured against the API: `gemini-flash-latest` answers as `gemini-3.6-flash` and refuses
	 * an unsigned call. Reading an alias as an old model is what reopens the bug, and the
	 * opposite mistake costs nothing, because 2.5 accepts a signature it never issued.
	 */
	it("says yes for a name that carries no generation", () => {
		expect(signsFunctionCalls("gemini-flash-latest")).toBe(true);
		expect(signsFunctionCalls("gemini-flash-lite-latest")).toBe(true);
		expect(signsFunctionCalls("gemini-pro-latest")).toBe(true);
	});
});
