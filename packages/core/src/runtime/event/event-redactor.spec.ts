import { describe, expect, it } from "vitest";
import { Secret } from "../../common/secrecy/secret";
import { EventRedactor } from "./event-redactor";

const redactor = new EventRedactor();

describe("EventRedactor", () => {
	it("masks every field of the closed list, whatever its casing", () => {
		const redacted = redactor.redact({
			apiKey: "sk-live",
			Authorization: "Bearer x",
			cookie: "a=b",
			"Set-Cookie": "a=b",
			token: "t",
			refreshToken: "r",
			password: "p",
			secret: "s",
		});

		expect(Object.values(redacted)).toEqual(Array.from({ length: 8 }, () => "[redacted]"));
	});

	it("leaves everything else exactly as it was", () => {
		const redacted = redactor.redact({ orderId: "42", keyword: "refund", monkeys: 3 });

		expect(redacted).toEqual({ orderId: "42", keyword: "refund", monkeys: 3 });
	});

	it("masks a Secret under any name at all", () => {
		const redacted = redactor.redact({ credentialOfTheSource: Secret.of("sk-live") });

		expect(redacted.credentialOfTheSource).toBe("[redacted]");
	});

	it("reaches a credential nested inside the payload", () => {
		const redacted = redactor.redact({ source: { name: "mcp", auth: { apiKey: "sk-live" } } });

		expect(redacted).toEqual({ source: { name: "mcp", auth: { apiKey: "[redacted]" } } });
	});

	it("reaches one inside an array, and keeps the array a list", () => {
		const redacted = redactor.redact({ sources: [{ apiKey: "sk-live" }, { name: "mcp" }] });

		expect(redacted.sources).toEqual([{ apiKey: "[redacted]" }, { name: "mcp" }]);
	});

	it("keeps the field, so an audit trail still shows that it was there", () => {
		const redacted = redactor.redact({ apiKey: "sk-live" });

		expect(Object.hasOwn(redacted, "apiKey")).toBe(true);
	});

	it("does not touch the payload it was given", () => {
		const payload = { apiKey: "sk-live" };

		redactor.redact(payload);

		expect(payload.apiKey).toBe("sk-live");
	});

	it("masks rather than walks a payload nested beyond anything a real event has", () => {
		let deep: Record<string, unknown> = { apiKey: "sk-live" };
		for (let level = 0; level < 12; level += 1) deep = { nested: deep };

		expect(JSON.stringify(redactor.redact(deep))).toContain("[redacted]");
	});
});
