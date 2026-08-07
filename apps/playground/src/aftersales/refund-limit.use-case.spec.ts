import { Clock, Instant } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { StoreDatabase } from "../shared/store-database";
import { OrderRepository } from "./order.repository";
import { OrderService } from "./order.service";
import { RefundLimitUseCase } from "./refund-limit.use-case";
import { RefundPolicy } from "./refund-policy";
import { RefundService } from "./refund.service";

class FixedClock extends Clock {
	public now(): Instant {
		return Instant.fromIso("2026-08-05T12:00:00.000Z");
	}
}

describe("RefundLimitUseCase", () => {
	it("answers the ceiling of the plan in cents", () => {
		const orders = new OrderRepository(new StoreDatabase());
		const useCase = new RefundLimitUseCase(
			new RefundService(new OrderService(orders), orders, new RefundPolicy(), new FixedClock()),
		);

		expect(useCase.execute("gold")).toBe(143_700);
		expect(useCase.execute("silver")).toBe(47_500);
	});

	it("answers the smallest ceiling for a plan nobody sells", () => {
		const orders = new OrderRepository(new StoreDatabase());
		const useCase = new RefundLimitUseCase(
			new RefundService(new OrderService(orders), orders, new RefundPolicy(), new FixedClock()),
		);

		expect(useCase.execute("platinum")).toBe(9_900);
	});
});
