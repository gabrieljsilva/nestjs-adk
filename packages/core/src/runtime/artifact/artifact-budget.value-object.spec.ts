import { describe, expect, it } from "vitest";
import { CharacterCountOffloadPolicy } from "../../domain/artifact/character-count-offload.policy";
import { ArtifactBudget } from "./artifact-budget.value-object";

describe("ArtifactBudget", () => {
	it("is the offload threshold, because an answer under it is one nothing would move out", () => {
		expect(ArtifactBudget.fromPolicy(CharacterCountOffloadPolicy.above(500)).characters).toBe(500);
	});

	it("still means something when the policy moves nothing out", () => {
		expect(ArtifactBudget.fromPolicy(CharacterCountOffloadPolicy.disabled()).characters).toBe(20_000);
		expect(ArtifactBudget.fromPolicy(CharacterCountOffloadPolicy.above(0)).characters).toBe(20_000);
	});

	it("measures an answer by what it costs on the wire", () => {
		expect(ArtifactBudget.measure({ a: 1 })).toBe(JSON.stringify({ a: 1 }).length);
	});

	it("leaves an answer that fits alone, and says it was not cut", () => {
		const fitted = new ArtifactBudget(1_000).fit({ id: "a-1", text: "short" }, "text");

		expect(fitted).toEqual({ id: "a-1", text: "short", truncated: false });
	});

	it("cuts a text that does not fit, and says so", () => {
		const fitted = new ArtifactBudget(60).fit({ id: "a-1", text: "x".repeat(500) }, "text");

		expect(fitted.truncated).toBe(true);
		expect(String(fitted.text).length).toBeLessThan(500);
		expect(ArtifactBudget.measure(fitted)).toBeLessThanOrEqual(60);
	});

	it("drops whole items off a list rather than half of one", () => {
		const items = Array.from({ length: 50 }, (_at, index) => ({ offset: index, excerpt: "y".repeat(40) }));

		const fitted = new ArtifactBudget(300).fit({ id: "a-1", matches: items }, "matches");

		expect(fitted.truncated).toBe(true);
		expect((fitted.matches as unknown[]).length).toBeLessThan(50);
		expect(ArtifactBudget.measure(fitted)).toBeLessThanOrEqual(300);
		for (const item of fitted.matches as { excerpt: string }[]) expect(item.excerpt).toHaveLength(40);
	});

	it("keeps the frame and spends what is left on the content, never the other way round", () => {
		const fitted = new ArtifactBudget(80).fit({ artifactId: "a-1", pointer: "/orders", text: "z".repeat(900) }, "text");

		expect(fitted.artifactId).toBe("a-1");
		expect(fitted.pointer).toBe("/orders");
	});

	it("drops a single value whole, because half a JSON object is not a value", () => {
		const fitted = new ArtifactBudget(40).fit({ id: "a-1", value: { deep: "q".repeat(400) } }, "value");

		expect(fitted.value).toBeNull();
		expect(fitted.truncated).toBe(true);
	});

	it("gives up the content entirely when the frame alone has taken the room", () => {
		const fitted = new ArtifactBudget(1).fit({ id: "a-1", text: "anything" }, "text");

		expect(fitted.text).toBe("");
		expect(fitted.truncated).toBe(true);
	});
});
