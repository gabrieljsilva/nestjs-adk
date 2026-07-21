import "@nestjs-adk/testing/matchers";
import { SessionStore } from "@nestjs-adk/core";
import { TestAgent } from "@nestjs-adk/testing";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule } from "./app.module";
import { ChatService } from "./support/chat.service";
import { SupportAgent } from "./support/support.agent";

/**
 * E2E of the full happy path: REAL AppModule (GoogleAdkEngine, the ADK's native loop),
 * only the LLM is scripted — new TestAgent() registers a ScriptedModel as the agent's model
 * override, so even runs triggered by production services (ChatService) consume the script.
 */
describe("playground e2e — store support", () => {
	let app: TestingModule;
	let chat: ChatService;
	let support: TestAgent<SupportAgent>;

	beforeEach(async () => {
		app = await Test.createTestingModule({ imports: [AppModule] }).compile();
		await app.init();
		chat = app.get(ChatService);
		support = new TestAgent(app, SupportAgent);
	});

	afterEach(async () => {
		await app.close();
	});

	it("TestAgent.mock* scripts the MODEL on the real engine (GoogleAdkEngine)", async () => {
		support.mockCallTool("lookup_order", { orderId: "123" }).mockText("Order 123 shipped!");

		const run = await support.ask({ sessionId: "chat-mock", userId: "u1", message: "where's my order 123?" });

		expect(run).toHaveCalledTool("lookup_order", { orderId: "123" });
		expect(run.text).toContain("shipped");
		expect(support.lastInstruction()).toContain("support agent");
	});

	it("order lookup via production service: class tool via DI in the ADK's real loop", async () => {
		support.mockCallTool("lookup_order", { orderId: "123" }).mockText("Your order 123 has already shipped!");

		const run = await chat.send("chat-1", "u1", "where's my order 123?");

		expect(run.text).toContain("shipped");
		expect(run).toHaveCalledTool("lookup_order", { orderId: "123" });
	});

	it("on-demand skill: agent looks up the refund policy via load_skill", async () => {
		support.mockCallTool("load_skill", { name: "refund_policy" }).mockText("Refunds within 7 days.");

		const run = await chat.send("chat-2", "u1", "what's the refund policy?");

		expect(run).toHaveCalledTool("load_skill", { name: "refund_policy" });
		const result = run.events.find((e) => e.type === "tool_result" && e.tool === "load_skill");
		expect(JSON.stringify(result && "result" in result ? result.result : "")).toContain("7 days");
	});

	it("small refund executes directly; large refund pauses (HITL) and resumes with approve()", async () => {
		// small: no approval needed
		support.mockCallTool("refund", { orderId: "123", amount: 250 }).mockText("Refund of $250 completed.");
		const low = await chat.send("chat-3", "u1", "refund order 123");
		expect(low.status).toBe("completed");

		// large: pauses
		support.mockCallTool("refund", { orderId: "456", amount: 1800 }).mockText("I need approval for that amount.");
		const high = await chat.send("chat-4", "u1", "refund order 456");
		expect(high.status).toBe("pending_approval");
		const pending = high.pending?.[0];
		expect(pending).toMatchObject({ tool: "refund", args: { orderId: "456", amount: 1800 } });

		// human approval → tool executes and the agent resumes
		support.mockText("Approved! Refund for order 456 completed.");
		// biome-ignore lint/style/noNonNullAssertion: pending action guaranteed above
		const resumed = await chat.approve("chat-4", pending!.callId);
		expect(resumed.status).toBe("completed");
		expect(resumed.text).toContain("456");
	});

	it("multi-turn session: history and instruction (prompt + skills) reach the model", async () => {
		support.mockText("Hi! How can I help?");
		await chat.send("chat-5", "u1", "hi!");

		support.mockText("About yesterday's order: it's already out for delivery.");
		const run = await chat.send("chat-5", "u1", "what about yesterday's order?");

		expect(run.text).toContain("delivery");

		const session = await app.get(SessionStore).get("chat-5");
		expect(session?.events.filter((e) => e.type === "message")).toHaveLength(4);
	});
});
