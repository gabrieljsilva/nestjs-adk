import { Secret } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { GenAiClientFactory } from "./genai-client-factory";

/** The SDK keeps what it was handed, which is the only way to see what the boundary revealed. */
const keyOf = (client: object): unknown => Reflect.get(client, "apiKey");

describe("GenAiClientFactory", () => {
	it("reveals a secret key once, at the call that builds the client", () => {
		const client = new GenAiClientFactory().create({ apiKey: Secret.of("sk-live-1") });

		expect(keyOf(client)).toBe("sk-live-1");
	});

	it("accepts a plain string at the option boundary, so an env var still reads well", () => {
		const client = new GenAiClientFactory().create({ apiKey: "sk-live-2" });

		expect(keyOf(client)).toBe("sk-live-2");
	});

	it("asks for no key on Vertex AI, where the surface authenticates on its own", () => {
		const client = new GenAiClientFactory().create({ vertexai: true, project: "p", location: "us-central1" });

		expect(Reflect.get(client, "vertexai")).toBe(true);
	});
});
