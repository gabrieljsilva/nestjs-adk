import type { LlmRequest } from "@google/adk";
import { toSnapshot } from "./context-capture";

function request(config: Record<string, unknown>, contents: unknown[] = []): LlmRequest {
	return { config, contents } as unknown as LlmRequest;
}

function textOf(snapshot: ReturnType<typeof toSnapshot>, kind: string): string {
	return snapshot.segments.find((segment) => segment.kind === kind)?.text ?? "";
}

describe("toSnapshot", () => {
	it("splits the request into the segments the provider receives, in order", () => {
		const snapshot = toSnapshot(request({ systemInstruction: "You are support." }), "support");

		expect(snapshot.agent).toBe("support");
		expect(snapshot.segments.map((segment) => segment.kind)).toEqual([
			"systemInstruction",
			"toolDeclarations",
			"contents",
		]);
	});

	it("reads systemInstruction from config, where the ADK puts it", () => {
		const snapshot = toSnapshot(request({ systemInstruction: "You are support." }), "support");

		expect(textOf(snapshot, "systemInstruction")).toBe("You are support.");
	});

	it("flattens a Content-shaped instruction to its text", () => {
		const snapshot = toSnapshot(
			request({ systemInstruction: { role: "system", parts: [{ text: "Part one. " }, { text: "Part two." }] } }),
			"support",
		);

		expect(textOf(snapshot, "systemInstruction")).toBe("Part one. Part two.");
	});

	it("an absent instruction is empty, not the string undefined", () => {
		expect(textOf(toSnapshot(request({}), "support"), "systemInstruction")).toBe("");
		expect(textOf(toSnapshot(request({}), "support"), "toolDeclarations")).toBe("");
	});

	it("key order is significant — it changes the bytes the provider caches on", () => {
		const a = toSnapshot(request({ tools: [{ name: "refund", description: "Refunds." }] }), "support");
		const b = toSnapshot(request({ tools: [{ description: "Refunds.", name: "refund" }] }), "support");

		// normalizing this away would report a stable prefix for a request that really does miss the cache
		expect(textOf(a, "toolDeclarations")).not.toBe(textOf(b, "toolDeclarations"));
	});

	it("keeps ARRAY order significant — a shifting tool catalog must be detectable", () => {
		const a = toSnapshot(request({ tools: [{ name: "a" }, { name: "b" }] }), "support");
		const b = toSnapshot(request({ tools: [{ name: "b" }, { name: "a" }] }), "support");

		expect(textOf(a, "toolDeclarations")).not.toBe(textOf(b, "toolDeclarations"));
	});

	it("undefined fields do not change the serialization", () => {
		const a = toSnapshot(request({ tools: [{ name: "refund", extra: undefined }] }), "support");
		const b = toSnapshot(request({ tools: [{ name: "refund" }] }), "support");

		expect(textOf(a, "toolDeclarations")).toBe(textOf(b, "toolDeclarations"));
	});

	it("carries the conversation and the model id", () => {
		const raw = request({ systemInstruction: "p" }, [{ role: "user", parts: [{ text: "hello" }] }]);
		raw.model = "gemini-2.5-flash";
		const snapshot = toSnapshot(raw, "support");

		expect(textOf(snapshot, "contents")).toContain("hello");
		expect(snapshot.model).toBe("gemini-2.5-flash");
	});
});
