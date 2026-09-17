import { Secret } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { OpenAiClientFactory } from "./openai-client.factory";

/** The SDK keeps what it was handed, which is the only way to see what the boundary revealed. */
const keyOf = (client: object): unknown => Reflect.get(client, "apiKey");

describe("OpenAiClientFactory", () => {
	it("reveals a secret key once, at the call that builds the client", () => {
		const client = new OpenAiClientFactory().create({ apiKey: Secret.of("sk-live-1") });

		expect(keyOf(client)).toBe("sk-live-1");
	});

	it("accepts a plain string at the option boundary, so an env var still reads well", () => {
		const client = new OpenAiClientFactory().create({ apiKey: "sk-live-2", baseURL: "http://localhost:11434/v1" });

		expect(keyOf(client)).toBe("sk-live-2");
	});
});
