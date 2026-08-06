import "reflect-metadata";
import { NotAToolClassError, type ToolContext } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { IssueRefundTool, OrderService } from "./support/store.fixture";
import { ToolFake } from "./tool-fake";

const CONTEXT = undefined as unknown as ToolContext;

describe("ToolFake", () => {
	it("takes the name from the tool it replaces, rather than restating it", () => {
		expect(ToolFake.replacing(IssueRefundTool).toolName).toBe("issue_refund");
	});

	it("refuses to stand in for a class that is not a tool", () => {
		expect(() => ToolFake.replacing(OrderService)).toThrow(NotAToolClassError);
	});

	it("answers what it was told to, every time", () => {
		const fake = ToolFake.replacing(IssueRefundTool).succeedsWith({ refunded: true });

		expect(fake.execute({ orderId: "A-1" }, CONTEXT)).toEqual({ refunded: true });
		expect(fake.execute({ orderId: "A-2" }, CONTEXT)).toEqual({ refunded: true });
	});

	it("records what the model chose, in order", () => {
		const fake = ToolFake.replacing(IssueRefundTool);

		fake.execute({ orderId: "A-1" }, CONTEXT);
		fake.execute({ orderId: "A-2" }, CONTEXT);

		expect(fake.callCount).toBe(2);
		expect(fake.calls.map((call) => call.args.orderId)).toEqual(["A-1", "A-2"]);
		expect(fake.lastArgs()).toEqual({ orderId: "A-2" });
	});

	it("has no last arguments before it was called", () => {
		expect(ToolFake.replacing(IssueRefundTool).lastArgs()).toBeUndefined();
	});

	it("throws what it was told to throw, and still records the call", () => {
		const fake = ToolFake.replacing(IssueRefundTool).failsWith(new Error("gateway down"));

		expect(() => fake.execute({ orderId: "A-1" }, CONTEXT)).toThrow("gateway down");
		expect(fake.callCount).toBe(1);
	});

	it("answers from the input when a constant would not be an answer", () => {
		const fake = ToolFake.replacing(IssueRefundTool).executes((args) => ({ echoed: args.orderId }));

		expect(fake.execute({ orderId: "A-1042" }, CONTEXT)).toEqual({ echoed: "A-1042" });
	});

	it("lets the last instruction win over the one before it", () => {
		const fake = ToolFake.replacing(IssueRefundTool).failsWith(new Error("down")).succeedsWith({ ok: true });

		expect(fake.execute({}, CONTEXT)).toEqual({ ok: true });
	});

	it("records an empty object when the model sent nothing an object could hold", () => {
		const fake = ToolFake.replacing(IssueRefundTool);

		fake.execute("not an object", CONTEXT);

		expect(fake.lastArgs()).toEqual({});
	});
});
