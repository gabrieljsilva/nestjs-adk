import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodToolSchema } from "./zod-tool-schema";

const orders = z.object({
	orderId: z.string().describe("The order to look up"),
	limit: z.number().int().default(10),
	status: z.enum(["open", "closed"]).optional(),
});

function declarationOf(schema: z.ZodType): Record<string, unknown> {
	const declaration = ZodToolSchema.of(schema).declaration();
	if (typeof declaration !== "object" || declaration === null) throw new Error("expected an object declaration");
	return { ...declaration };
}

describe("ZodToolSchema", () => {
	it("describes the schema to the model instead of asking for a second description of it", () => {
		const declaration = declarationOf(orders);

		expect(declaration.type).toBe("object");
		expect(Object.keys(Object(declaration.properties))).toEqual(["orderId", "limit", "status"]);
		expect(JSON.stringify(declaration)).toContain("The order to look up");
	});

	it("asks the model only for what it has to send, so a field with a default is optional", () => {
		expect(declarationOf(orders).required).toEqual(["orderId"]);
	});

	it("leaves out the dialect, which describes the document rather than the arguments", () => {
		expect(declarationOf(orders).$schema).toBeUndefined();
	});

	it("inlines what is reused, because a reference is what several providers refuse", () => {
		const address = z.object({ street: z.string() });
		const declaration = JSON.stringify(declarationOf(z.object({ billing: address, shipping: address })));

		expect(declaration).not.toContain("$ref");
		expect(declaration).not.toContain("$defs");
	});

	it("describes a tool that takes nothing, rather than refusing to describe it", () => {
		expect(declarationOf(z.object({})).type).toBe("object");
	});

	it("takes a declaration the caller wrote when a provider needs something else", () => {
		const explicit = { type: "object", properties: {} };

		expect(ZodToolSchema.withDeclaration(orders, explicit).declaration()).toBe(explicit);
	});

	it("accepts arguments the schema accepts, and hands over what zod produced", () => {
		const parsed = ZodToolSchema.of(orders).parse({ orderId: "42" });

		expect(parsed.isValid).toBe(true);
		expect(parsed.values).toEqual({ orderId: "42", limit: 10 });
	});

	it("refuses arguments a model wrote badly, as a reason rather than as a thrown error", () => {
		const parsed = ZodToolSchema.of(orders).parse({ orderId: 42 });

		expect(parsed.isValid).toBe(false);
		expect(parsed.reason.length).toBeGreaterThan(0);
	});

	it("refuses anything that is not an object of arguments", () => {
		expect(ZodToolSchema.of(z.string()).parse("hello").isValid).toBe(false);
		expect(ZodToolSchema.of(orders).parse(["42"]).isValid).toBe(false);
	});
});
