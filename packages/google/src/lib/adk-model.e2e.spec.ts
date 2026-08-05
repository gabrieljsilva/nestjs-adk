import "@nestjs-adk/testing/matchers";
import {
	AdkAgent,
	AdkModel,
	AdkModule,
	AdkTool,
	Agent,
	type ModelRequest,
	type ModelResponse,
	Tool,
} from "@nestjs-adk/core";
import { TestAgent } from "@nestjs-adk/testing";
import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { z } from "zod";
import { GoogleAdkEngine } from "./google-adk-engine";

/**
 * E2E of a custom AdkModel as the production model of an app: the agent is injected
 * by class into a service (the real DX), the ADK loop is 100% native and only the
 * "provider" is the user's implementation — including HITL pause/resume.
 */

const refundSchema = z.object({ orderId: z.string(), amount: z.number() });

@Tool({ name: "refund", description: "Refunds an order.", schema: refundSchema, effect: "destructive" })
class RefundTool extends AdkTool<typeof refundSchema> {
	execute(input: z.infer<typeof refundSchema>) {
		return { refunded: input.orderId, amount: input.amount };
	}
}

@Injectable()
class BillingModel extends AdkModel {
	public readonly model = "billing-custom";
	public requests: ModelRequest[] = [];

	public async *generate(request: ModelRequest): AsyncIterable<ModelResponse> {
		this.requests.push(request);
		const wantsRefund = request.messages.some(
			(message) => message.role === "user" && message.parts.some((part) => "text" in part && part.text.includes("refund")),
		);
		const refunded = request.messages.some((message) => message.parts.some((part) => "toolResult" in part));
		if (wantsRefund && !refunded && request.tools?.some((tool) => tool.name === "refund")) {
			yield { parts: [{ toolCall: { name: "refund", args: { orderId: "456", amount: 1800 } } }] };
			return;
		}
		yield { parts: [{ text: refunded ? "Refund for order 456 completed." : "How can I help?" }] };
	}
}

@Agent({ name: "billing_agent", description: "Billing.", model: BillingModel, tools: [RefundTool] })
class BillingAgent extends AdkAgent {}

@Injectable()
class BillingService {
	public constructor(private readonly billing: BillingAgent) {}

	public refund(sessionId: string, message: string) {
		return this.billing.ask({ sessionId, userId: "u1", message });
	}

	public approve(sessionId: string, callId: string) {
		return this.billing.approve({ sessionId, callId });
	}
}

@Module({ providers: [BillingAgent, BillingModel, RefundTool, BillingService] })
class BillingModule {}

describe("custom AdkModel e2e — production wiring", () => {
	let app: TestingModule;
	let service: BillingService;
	let model: BillingModel;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: GoogleAdkEngine, defaultModel: "gemini-2.5-flash" }), BillingModule],
		}).compile();
		await app.init();
		service = app.get(BillingService);
		model = app.get(BillingModel);
	});

	afterEach(async () => {
		await app.close();
	});

	it("agent injected by class into a service runs on the custom model", async () => {
		const run = await service.refund("e2e-1", "hello");

		expect(run.status).toBe("completed");
		expect(run.text).toBe("How can I help?");
		expect(model.requests).toHaveLength(1);
	});

	it("HITL: custom model's tool call pauses for approval and resumes after approve()", async () => {
		const run = await service.refund("e2e-2", "refund order 456");

		expect(run.status).toBe("pending_approval");
		const pending = run.pending?.[0];
		expect(pending).toMatchObject({ tool: "refund", args: { orderId: "456", amount: 1800 } });

		// biome-ignore lint/style/noNonNullAssertion: pending action guaranteed above
		const resumed = await service.approve("e2e-2", pending!.callId);

		expect(resumed.status).toBe("completed");
		expect(resumed.text).toContain("456");
		// on resume the custom model saw the executed tool's result in its messages
		const lastRequest = model.requests.at(-1);
		expect(
			lastRequest?.messages.some((message) =>
				message.parts.some((part) => "toolResult" in part && part.toolResult.name === "refund"),
			),
		).toBe(true);
	});

	it("TestAgent overrides the custom model — the scripted model answers, the custom one is never called", async () => {
		const billing = new TestAgent(app, BillingAgent);
		billing.mockText("scripted answer");

		const run = await service.refund("e2e-3", "hello");

		expect(run.text).toBe("scripted answer");
		expect(model.requests).toHaveLength(0);
	});
});
