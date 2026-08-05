import "reflect-metadata";
import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { FakeClock } from "../../support/fake-clock";
import { RecordingModel } from "../../support/nest/recording-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { AdkModule } from "./adk-module";
import { AdkModuleOptions } from "./adk-module-options";
import { AgentRegistry } from "./agent-registry";
import { Agent } from "./decorators/agent.decorator";
import { Skill } from "./decorators/skill.decorator";
import { Tool } from "./decorators/tool.decorator";
import { TransfersTo } from "./decorators/transfers-to.decorator";

const lookupSchema = z.object({ orderId: z.string().describe("Order number.") });

@Injectable()
class OrdersService {
	public find(orderId: string): unknown {
		return { orderId, status: "shipped" };
	}
}

@Tool({ name: "lookup_order", description: "Looks up an order.", schema: lookupSchema, effect: "read" })
@Injectable()
class LookupOrderTool {
	public constructor(private readonly orders: OrdersService) {}

	public execute(input: { orderId: string }): unknown {
		return this.orders.find(input.orderId);
	}
}

@Agent({
	name: "support",
	description: "Handles orders.",
	prompt: "Be brief.",
	tools: [LookupOrderTool],
})
@TransfersTo("billing")
class SupportAgent {
	@Skill({ name: "tone", description: "Brand tone.", mode: "always" })
	public tone(): string {
		return "Answer in a friendly tone.";
	}

	@Tool({ description: "Refunds an order.", schema: lookupSchema })
	public refund(input: { orderId: string }): unknown {
		return { refunded: input.orderId };
	}
}

@Agent({ name: "billing", description: "Handles money." })
class BillingAgent {}

describe("AdkModule over the native runtime", () => {
	let app: TestingModule;

	afterEach(async () => {
		await app?.close();
	});

	async function bootWith(model: RecordingModel): Promise<TestingModule> {
		@Module({ providers: [OrdersService, LookupOrderTool, SupportAgent, BillingAgent] })
		class FeatureModule {}

		app = await Test.createTestingModule({
			imports: [
				AdkModule.forRoot(new AdkModuleOptions(model, undefined, undefined, new FakeClock(), new SequenceIdGenerator())),
				FeatureModule,
			],
		}).compile();
		app.enableShutdownHooks();
		await app.init();
		return app;
	}

	it("answers a question through an agent the application declared", async () => {
		const booted = await bootWith(new RecordingModel("hello there"));

		const result = await booted.get(AgentRegistry).get("support").ask("hi");

		expect(result.text).toBe("hello there");
		expect(result.status.name).toBe("completed");
	});

	it("offers the model the shared tool, the agent's own tool and the runtime's", async () => {
		const model = new RecordingModel();
		const booted = await bootWith(model);

		await booted.get(AgentRegistry).get("support").ask("hi");

		const offered = model.requests[0]?.tools.map((tool: { name: string }) => tool.name) ?? [];
		expect(offered).toContain("lookup_order");
		expect(offered).toContain("refund");
		expect(offered).toContain("transfer_to_agent");
	});

	it("puts an always skill in the instructions, where it stays for every turn", async () => {
		const model = new RecordingModel();
		const booted = await bootWith(model);

		await booted.get(AgentRegistry).get("support").ask("hi");

		expect(model.requests[0]?.instructions?.text).toContain("Answer in a friendly tone.");
	});

	it("lists every agent that was declared, and refuses one that was not", async () => {
		const booted = await bootWith(new RecordingModel());
		const registry = booted.get(AgentRegistry);

		expect(registry.names).toEqual(expect.arrayContaining(["support", "billing"]));
		expect(() => registry.get("nobody")).toThrow();
	});

	it("hands back the same handle twice for the same agent", async () => {
		const booted = await bootWith(new RecordingModel());
		const registry = booted.get(AgentRegistry);

		expect(registry.get("support")).toBe(registry.get("support"));
	});

	it("keeps a session between two questions to the same handle", async () => {
		const booted = await bootWith(new RecordingModel());
		const support = booted.get(AgentRegistry).get("support");

		const first = await support.ask("hi");
		const second = await support.ask("again", first.sessionId);

		expect(second.sessionId.value).toBe(first.sessionId.value);
		expect((await support.inspect(first.sessionId)).isAwaitingApproval).toBe(false);
	});
});
