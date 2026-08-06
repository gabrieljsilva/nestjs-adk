import { beforeEach, describe, expect, it } from "vitest";
import { IssueRefundUseCase } from "../aftersales/issue-refund.use-case";
import { OrderRepository } from "../aftersales/order.repository";
import { OrderService } from "../aftersales/order.service";
import { RefundPolicy } from "../aftersales/refund-policy";
import { RefundService } from "../aftersales/refund.service";
import { IssueRefundTool } from "./issue-refund.tool";
import { seedClock, seededStore } from "./tool-suite.fixture";

let tool: IssueRefundTool;
let orders: OrderRepository;

beforeEach(() => {
	orders = new OrderRepository(seededStore());
	const refunds = new RefundService(new OrderService(orders), orders, new RefundPolicy(), seedClock());
	tool = new IssueRefundTool(new IssueRefundUseCase(refunds));
});

describe("IssueRefundTool", () => {
	it("refunds in reais and records centavos", () => {
		expect(tool.execute({ orderId: "A-1042", amountBrl: 349 })).toEqual({
			refunded: true,
			orderId: "A-1042",
			amountBrl: 349,
		});
		expect(orders.findById("A-1042")?.refundedCents).toBe(34_900);
	});

	it("tells the run why it was refused instead of failing it", () => {
		const answer = tool.execute({ orderId: "B-2071", amountBrl: 189 });

		expect(Reflect.get(Object(answer), "refunded")).toBe(false);
		expect(Reflect.get(Object(answer), "error")).toContain("7 days");
	});

	it("tells the run when the order does not exist", () => {
		expect(Reflect.get(Object(tool.execute({ orderId: "A-9", amountBrl: 10 })), "error")).toContain("A-9");
	});

	it("writes nothing when the policy refuses", () => {
		tool.execute({ orderId: "B-2071", amountBrl: 189 });

		expect(orders.findById("B-2071")?.isRefunded).toBe(false);
	});
});
