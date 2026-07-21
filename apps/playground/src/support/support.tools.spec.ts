import { Test } from "@nestjs/testing";
import { OrdersService } from "./orders.service";
import { LookupOrderTool, SupportAgent } from "./support.agent";

/**
 * How to unit test tools — no lib machinery required, ON PURPOSE:
 * a tool is a plain class with execute(); an inline tool is a plain method on the agent.
 * 1. new Tool(fakeDep)                      → fastest, for logic-heavy tools
 * 2. Test.createTestingModule + override    → when you want the real DI wiring (Nest-native)
 * 3. useMocker(auto-mock)                   → when the tool has many deps you don't care about
 * The agent-level behavior (did the LLM call the right tool?) is a different layer —
 * that's what TestAgent + mockCallTool cover (see @nestjs-adk/testing).
 */
describe("support tools (unit)", () => {
	it("1. pure instantiation — a tool is just a class", () => {
		const tool = new LookupOrderTool(new OrdersService());

		expect(tool.execute({ orderId: "123" })).toMatchObject({ status: "shipped", total: 250 });
	});

	it("1b. LLM-facing error contract: not found returns a payload, never throws", () => {
		const tool = new LookupOrderTool(new OrdersService());

		expect(tool.execute({ orderId: "999" })).toEqual({ error: "Order 999 not found." });
	});

	it("2. Nest TestingModule — real DI, dependency overridden the Nest-native way", async () => {
		const fakeOrders = { find: vi.fn().mockReturnValue({ id: "123", status: "delivered", total: 250 }) };
		const module = await Test.createTestingModule({ providers: [LookupOrderTool, OrdersService] })
			.overrideProvider(OrdersService)
			.useValue(fakeOrders)
			.compile();

		const tool = module.get(LookupOrderTool);

		expect(tool.execute({ orderId: "123" })).toMatchObject({ status: "delivered" });
		expect(fakeOrders.find).toHaveBeenCalledWith("123");
	});

	it("3. useMocker — every unlisted dependency auto-mocked", async () => {
		const module = await Test.createTestingModule({ providers: [LookupOrderTool] })
			.useMocker(() => ({ find: vi.fn().mockReturnValue({ id: "1", status: "processing", total: 9 }) }))
			.compile();

		expect(module.get(LookupOrderTool).execute({ orderId: "1" })).toMatchObject({ status: "processing" });
	});

	it("inline tools are plain methods on the agent — same treatment", () => {
		const agent = new SupportAgent(new OrdersService());

		expect(agent.refund({ orderId: "456", amount: 100 })).toEqual({ refunded: true, orderId: "456" });
	});
});
