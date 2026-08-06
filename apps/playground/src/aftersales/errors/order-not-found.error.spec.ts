import { AdkError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { OrderNotFoundError } from "./order-not-found.error";

describe("OrderNotFoundError", () => {
	it("carries the number that was asked for", () => {
		expect(new OrderNotFoundError("A-9").orderId).toBe("A-9");
		expect(new OrderNotFoundError("A-9").message).toContain("A-9");
	});

	it("is an AdkError with a code a caller can branch on", () => {
		expect(new OrderNotFoundError("A-9")).toBeInstanceOf(AdkError);
		expect(new OrderNotFoundError("A-9").code).toBe("PLAYGROUND_ORDER_NOT_FOUND");
	});
});
