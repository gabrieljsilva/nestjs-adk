import "reflect-metadata";
import { Injectable, Module, Scope } from "@nestjs/common";
import { Test, type TestingModule, type TestingModuleBuilder } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { UnusableComponentError } from "../../adapters/nest/errors/unusable-component.error";
import { ModelResolver } from "../../contracts/model-resolver";
import { SessionEventConsumer } from "../../contracts/session-event-consumer";
import type { AgentDefinition } from "../../domain/agent/agent-definition";
import type { PublishedEvent } from "../../domain/event/published-event";
import type { LlmModel } from "../../domain/model/llm-model";
import { FakeClock } from "../../support/fake-clock";
import { RecordingModel } from "../../support/nest/recording-model.fixture";
import { ToolCallingModel } from "../../support/nest/tool-calling-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { AdkAgent } from "./adk-agent";
import { ADK_DEFAULT_MODEL, ADK_EVENT_CONSUMERS, AdkModule } from "./adk-module";
import { AdkModuleOptions } from "./adk-module-options";
import { AdkTool } from "./adk-tool";
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
class LookupOrderTool extends AdkTool<typeof lookupSchema> {
	public constructor(private readonly orders: OrdersService) {
		super();
	}

	public execute(input: z.infer<typeof lookupSchema>): unknown {
		return this.orders.find(input.orderId);
	}
}

/**
 * An agent with a dependency, extended from `AdkAgent`, and that shape is the point.
 *
 * Both halves are what the composition used to get wrong: a class with constructor
 * dependencies is built after the container has handed out prototypes, and an agent that
 * answers `ask` itself only works if the handle reached the instance the container kept.
 */
@Agent({
	name: "support",
	description: "Handles orders.",
	prompt: "Be brief.",
	tools: [LookupOrderTool],
})
@TransfersTo("billing")
class SupportAgent extends AdkAgent {
	public constructor(private readonly orders: OrdersService) {
		super();
	}

	public latest(orderId: string): unknown {
		return this.orders.find(orderId);
	}

	@Skill({ name: "tone", description: "Brand tone.", mode: "always" })
	public tone(): string {
		return "Answer in a friendly tone.";
	}

	@Tool({ description: "Refunds an order.", schema: lookupSchema })
	public refund(input: z.infer<typeof lookupSchema>): unknown {
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

	async function bootWith(model: LlmModel, configure?: (builder: TestingModuleBuilder) => void): Promise<TestingModule> {
		@Module({ providers: [OrdersService, LookupOrderTool, SupportAgent, BillingAgent] })
		class FeatureModule {}

		const builder = Test.createTestingModule({
			imports: [
				AdkModule.forRoot(new AdkModuleOptions(model, undefined, undefined, new FakeClock(), new SequenceIdGenerator())),
				FeatureModule,
			],
		});
		configure?.(builder);
		app = await builder.compile();
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

	/**
	 * The two cases the suite used to be blind to.
	 *
	 * Everything above passes with a runtime composed around discarded prototypes, because
	 * a tool that was offered is not a tool that works, and an agent reached by name is not
	 * the same object as the class the application injects.
	 */
	it("runs a tool that injects a service, and the answer is the service's", async () => {
		const model = new ToolCallingModel("lookup_order", { orderId: "A-1042" }, "it shipped");
		const booted = await bootWith(model);

		const result = await booted.get(AgentRegistry).get("support").ask("where is A-1042?");

		expect(JSON.stringify(model.requests.at(-1))).toContain("shipped");
		expect(JSON.stringify(model.requests.at(-1))).not.toContain("undefined");
		expect(result.text).toBe("it shipped");
	});

	it("answers through the agent class the application injected, dependencies and all", async () => {
		const booted = await bootWith(new RecordingModel("hello there"));
		const support = booted.get(SupportAgent);

		expect(support.agentName.value).toBe("support");
		expect((await support.ask("hi")).text).toBe("hello there");
		expect(support.latest("A-1042")).toEqual({ orderId: "A-1042", status: "shipped" });
	});

	it("records events through a consumer plugged in by token, without rebuilding the options", async () => {
		const seen: string[] = [];
		class Recorder extends SessionEventConsumer {
			public readonly name = "recorder";
			public async consume(event: PublishedEvent): Promise<void> {
				seen.push(event.type);
			}
		}
		const booted = await bootWith(new RecordingModel("hello"), (builder) =>
			builder.overrideProvider(ADK_EVENT_CONSUMERS).useValue([new Recorder()]),
		);

		await booted.get(AgentRegistry).get("support").ask("hi");

		expect(seen).toContain("run.assistant-message-produced");
	});

	it("routes one agent to another model when the resolver is overridden", async () => {
		const routed = new RecordingModel("routed answer");
		class RoutingResolver extends ModelResolver {
			public resolve(definition: AgentDefinition): LlmModel {
				return definition.name.value === "support" ? routed : definition.model;
			}
		}
		const booted = await bootWith(new RecordingModel("default answer"), (builder) =>
			builder.overrideProvider(ModelResolver).useValue(new RoutingResolver()),
		);
		const registry = booted.get(AgentRegistry);

		expect((await registry.get("support").ask("hi")).text).toBe("routed answer");
		expect((await registry.get("billing").ask("hi")).text).toBe("default answer");
	});

	it("swaps the fallback model by token and leaves a declared model alone", async () => {
		const declared = new RecordingModel("from the declared model");
		const replacement = new RecordingModel("from the replacement");

		@Agent({ name: "pinned", description: "Keeps its model.", model: declared })
		class PinnedAgent {}

		@Module({ providers: [PinnedAgent, BillingAgent] })
		class MixedModule {}

		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot(new AdkModuleOptions(new RecordingModel("from the original default"))), MixedModule],
		})
			.overrideProvider(ADK_DEFAULT_MODEL)
			.useValue(replacement)
			.compile();
		await app.init();
		const registry = app.get(AgentRegistry);

		expect((await registry.get("billing").ask("hi")).text).toBe("from the replacement");
		expect((await registry.get("pinned").ask("hi")).text).toBe("from the declared model");
	});

	it("refuses a component the container cannot hand one instance of", async () => {
		@Agent({ name: "scoped", description: "Scoped." })
		class ScopedAgent {}

		@Module({ providers: [{ provide: ScopedAgent, useClass: ScopedAgent, scope: Scope.REQUEST }] })
		class ScopedModule {}

		await expect(
			Test.createTestingModule({
				imports: [AdkModule.forRoot(new AdkModuleOptions(new RecordingModel())), ScopedModule],
			})
				.compile()
				.then((module) => module.init()),
		).rejects.toThrow(UnusableComponentError);
	});
});
