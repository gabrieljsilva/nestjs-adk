import { AdkAgent } from "@nestjs-adk/core";
import { beforeEach, describe, expect, it } from "vitest";
import { FindOrderUseCase } from "../aftersales/find-order.use-case";
import { OrderRepository } from "../aftersales/order.repository";
import { OrderService } from "../aftersales/order.service";
import { RefundLimitUseCase } from "../aftersales/refund-limit.use-case";
import { RefundPolicy } from "../aftersales/refund-policy";
import { RefundService } from "../aftersales/refund.service";
import { BillingAgent } from "./billing.agent";
import { seedClock, seededStore } from "./tool-suite.fixture";

let agent: BillingAgent;

beforeEach(() => {
	const orders = new OrderRepository(seededStore());
	const service = new OrderService(orders);
	const clock = seedClock();
	agent = new BillingAgent(
		new FindOrderUseCase(service),
		new RefundLimitUseCase(new RefundService(service, orders, new RefundPolicy(), clock)),
		clock,
	);
});

describe("BillingAgent", () => {
	it("is an agent an application can inject as itself", () => {
		expect(agent).toBeInstanceOf(AdkAgent);
	});

	it("shows the order, in the reais a conversation speaks in", () => {
		expect(agent.findOrder({ orderId: "A-1042" })).toEqual({
			orderId: "A-1042",
			customer: "Ana Ribeiro",
			product: "Controle sem fio DualSense Nitro",
			totalBrl: 349,
			plan: "gold",
			status: "delivered",
			daysSinceDelivery: 2,
		});
	});

	it("tells the run the order does not exist instead of failing it", () => {
		expect(Reflect.get(Object(agent.findOrder({ orderId: "A-9" })), "error")).toContain("A-9");
	});

	it("answers the ceiling of a plan in reais", () => {
		expect(agent.refundLimit({ plan: "gold" })).toEqual({ plan: "gold", limitBrl: 1437 });
		expect(agent.refundLimit({ plan: "silver" })).toEqual({ plan: "silver", limitBrl: 475 });
	});

	it("answers the smallest ceiling for a plan nobody sells", () => {
		expect(Reflect.get(Object(agent.refundLimit({ plan: "platinum" })), "limitBrl")).toBe(99);
	});
});
