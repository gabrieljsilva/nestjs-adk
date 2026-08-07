import "reflect-metadata";
import { Injectable, Module, Scope } from "@nestjs/common";
import { Test, type TestingModule, type TestingModuleBuilder } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { UnregisteredToolError } from "../../adapters/nest/errors/unregistered-tool.error";
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
import { DelegatesTo } from "./decorators/delegates-to.decorator";
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
// `BillingAgent` is defined below, so naming it directly here reads `undefined`: the
// function is what defers the read to the scan, and this fixture is the proof it works.
@TransfersTo(() => BillingAgent)
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

	/**
	 * Substituting a tool is the one thing a hand built provider cannot prove.
	 *
	 * The bug this guards was never in the scan's logic: it was in the shape NestJS gives a
	 * wrapper once a provider is overridden. A value leaves no metatype at all, a factory
	 * leaves an anonymous one, and reading the declaration from there meant the tool left the
	 * catalog on a boot that reported success. Only a real container puts those shapes on the
	 * table, so this runs against one.
	 */
	it("keeps a tool that was replaced by a value, and calls the value", async () => {
		const model = new ToolCallingModel("lookup_order", { orderId: "A-1042" }, "stood in");
		const booted = await bootWith(model, (builder) =>
			builder.overrideProvider(LookupOrderTool).useValue({ execute: () => ({ status: "from the double" }) }),
		);

		const result = await booted.get(AgentRegistry).get("support").ask("where is A-1042?");

		expect(model.requests[0]?.tools.map((tool: { name: string }) => tool.name)).toContain("lookup_order");
		expect(JSON.stringify(model.requests.at(-1))).toContain("from the double");
		expect(result.text).toBe("stood in");
	});

	it("keeps a tool that was replaced by a class, with the declaration the agent listed", async () => {
		@Injectable()
		class LookupOrderDouble {
			public execute(): unknown {
				return { status: "from the class" };
			}
		}

		const model = new ToolCallingModel("lookup_order", { orderId: "A-1042" }, "stood in");
		const booted = await bootWith(model, (builder) =>
			builder.overrideProvider(LookupOrderTool).useClass(LookupOrderDouble),
		);

		await booted.get(AgentRegistry).get("support").ask("where is A-1042?");

		expect(JSON.stringify(model.requests.at(-1))).toContain("from the class");
	});

	it("keeps a tool that was replaced by a factory, which leaves no class at all", async () => {
		const model = new ToolCallingModel("lookup_order", { orderId: "A-1042" }, "stood in");
		const booted = await bootWith(model, (builder) =>
			builder.overrideProvider(LookupOrderTool).useFactory({ factory: () => ({ execute: () => ({ v: "made" }) }) }),
		);

		await booted.get(AgentRegistry).get("support").ask("where is A-1042?");

		expect(JSON.stringify(model.requests.at(-1))).toContain("made");
	});

	/** An agent behind a double is still the agent it declared itself to be, and still answers by name. */
	it("keeps an agent that was replaced by a value", async () => {
		const booted = await bootWith(new RecordingModel("hello there"), (builder) =>
			builder.overrideProvider(BillingAgent).useValue({}),
		);

		expect(booted.get(AgentRegistry).names).toContain("billing");
	});

	/**
	 * Two agents that reach each other, which is the case names existed to avoid.
	 *
	 * Neither class is defined when the other's decorator runs, so neither can be named
	 * directly. Both sides declare a function instead, and the scan calls it once every module
	 * has loaded, which is the same shape an ORM uses for a relation that points back.
	 */
	it("resolves edges that point at each other, declared as classes", async () => {
		@Agent({ name: "front", description: "Answers first." })
		@TransfersTo(() => BackAgent)
		class FrontAgent {}

		@Agent({ name: "back", description: "Answers after." })
		@TransfersTo(() => FrontAgent)
		@DelegatesTo(() => FrontAgent)
		class BackAgent {}

		@Module({ providers: [FrontAgent, BackAgent] })
		class CycleModule {}

		const model = new RecordingModel();
		const builder = Test.createTestingModule({
			imports: [AdkModule.forRoot(new AdkModuleOptions(model)), CycleModule],
		});
		app = await builder.compile();
		await app.init();

		await app.get(AgentRegistry).get("front").ask("hi");

		const offered = model.requests[0]?.tools.map((tool: { name: string }) => tool.name) ?? [];
		expect(offered).toContain("transfer_to_agent");
		expect(app.get(AgentRegistry).names).toEqual(expect.arrayContaining(["front", "back"]));
	});

	/**
	 * An edge that was declared as a class, actually walked.
	 *
	 * Declaring one and using one are different facts: the class resolves to a name during the
	 * scan, and what proves the name was the right one is a model calling `transfer_to_agent`
	 * with it and the session ending up somewhere else.
	 */
	it("moves the session along an edge that was declared as a class", async () => {
		const model = new ToolCallingModel("transfer_to_agent", { agentName: "billing" }, "billing has it now");
		const booted = await bootWith(model);

		const result = await booted.get(AgentRegistry).get("support").ask("who handles refunds?");
		const answering = model.requests.at(-1);

		// Billing declares no tools and no prompt, so the turn after the handover proves who
		// built it: support's tools and support's always skill are both gone.
		expect(result.status.name).toBe("completed");
		expect(answering?.tools.map((tool: { name: string }) => tool.name)).not.toContain("lookup_order");
		expect(answering?.instructions?.text ?? "").not.toContain("Answer in a friendly tone.");
	});

	it("resolves a delegation edge declared as a function, through the container", async () => {
		@Agent({ name: "asker", description: "Asks somebody else." })
		@DelegatesTo(() => AnsweringAgent)
		class AskingAgent {}

		@Agent({ name: "answerer", description: "Answers one question." })
		class AnsweringAgent {}

		@Module({ providers: [AskingAgent, AnsweringAgent] })
		class DelegatingModule {}

		const model = new RecordingModel();
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot(new AdkModuleOptions(model)), DelegatingModule],
		}).compile();
		await app.init();

		await app.get(AgentRegistry).get("asker").ask("hi");

		expect(model.requests[0]?.tools.map((tool: { name: string }) => tool.name)).toContain("delegate_to_agent");
	});

	/**
	 * The one thing naming the class does not prove.
	 *
	 * A class says the agent exists. It says nothing about anybody having registered it, so the
	 * boot check that catches an edge into thin air still has to be there.
	 */
	it("refuses an edge to an agent class nobody registered", async () => {
		@Agent({ name: "stranger", description: "Never registered." })
		class StrangerAgent {}

		@Agent({ name: "front", description: "Answers first." })
		@TransfersTo(StrangerAgent)
		class FrontAgent {}

		@Module({ providers: [FrontAgent] })
		class DanglingModule {}

		await expect(
			Test.createTestingModule({
				imports: [AdkModule.forRoot(new AdkModuleOptions(new RecordingModel())), DanglingModule],
			})
				.compile()
				.then((module) => module.init()),
		).rejects.toThrow(/stranger/);
	});

	/** A tool behind a token of its own declares itself through the class the module built. */
	it("finds a tool registered under a token that carries no decorators", async () => {
		const SHIP_ORDER = Symbol("SHIP_ORDER");

		@Module({
			providers: [OrdersService, { provide: SHIP_ORDER, useClass: LookupOrderTool }, SupportAgent, BillingAgent],
		})
		class TokenModule {}

		const model = new RecordingModel();
		app = await Test.createTestingModule({
			imports: [AdkModule.forRoot(new AdkModuleOptions(model)), TokenModule],
		}).compile();
		await app.init();

		await app.get(AgentRegistry).get("support").ask("hi");

		expect(model.requests[0]?.tools.map((tool: { name: string }) => tool.name)).toContain("lookup_order");
	});

	/**
	 * A handover is only worth anything if it outlives the turn it happened in.
	 *
	 * The session remembers who owns it, so the next question lands on the agent that received
	 * the conversation and not on the handle the application happened to hold. Billing declares
	 * no tools and no prompt, so the request built for the second question proves who built it.
	 */
	it("continues the conversation with the agent the session was transferred to", async () => {
		const model = new ToolCallingModel("transfer_to_agent", { agentName: "billing" }, "billing has it now");
		const booted = await bootWith(model);
		const support = booted.get(AgentRegistry).get("support");

		const first = await support.ask("who handles refunds?");
		await support.ask("and my order?", first.sessionId);
		const second = model.requests.at(-1);

		expect(second?.tools.map((tool: { name: string }) => tool.name)).not.toContain("lookup_order");
		expect(second?.instructions?.text ?? "").not.toContain("Answer in a friendly tone.");
	});

	/** Without a session there is nobody to inherit from, so the handle decides and becomes the root. */
	it("answers as the agent that was called when the conversation is new", async () => {
		const model = new RecordingModel();
		const booted = await bootWith(model);

		await booted.get(AgentRegistry).get("billing").ask("hi");

		expect(model.requests[0]?.tools.map((tool: { name: string }) => tool.name)).not.toContain("lookup_order");
	});

	/**
	 * Reaching a different handle is not a way around the declared graph.
	 *
	 * The session belongs to billing by then, and billing declares no edges at all, so asking
	 * through the support handle answers as billing rather than handing the conversation back
	 * to an agent nobody said could have it.
	 */
	it("does not hand the session back just because another handle was called", async () => {
		const model = new ToolCallingModel("transfer_to_agent", { agentName: "billing" }, "billing has it now");
		const booted = await bootWith(model);
		const registry = booted.get(AgentRegistry);

		const first = await registry.get("support").ask("who handles refunds?");
		const second = await registry.get("support").ask("and my order?", first.sessionId);

		expect(second.status.name).toBe("completed");
		expect(model.requests.at(-1)?.tools.map((tool: { name: string }) => tool.name)).not.toContain("transfer_to_agent");
	});

	it("refuses a target class that never declared an agent, naming it", async () => {
		class NotAnAgent {}

		@Agent({ name: "front", description: "Answers first." })
		@TransfersTo(NotAnAgent)
		class FrontAgent {}

		@Module({ providers: [FrontAgent] })
		class BrokenModule {}

		await expect(
			Test.createTestingModule({
				imports: [AdkModule.forRoot(new AdkModuleOptions(new RecordingModel())), BrokenModule],
			})
				.compile()
				.then((module) => module.init()),
		).rejects.toThrow(/NotAnAgent, which does not declare @Agent/);
	});

	it("refuses an agent that lists a tool no provider declares", async () => {
		@Agent({ name: "orphan", description: "Lists what nobody registered.", tools: [LookupOrderTool] })
		class OrphanAgent {}

		@Module({ providers: [OrphanAgent] })
		class OrphanModule {}

		await expect(
			Test.createTestingModule({
				imports: [AdkModule.forRoot(new AdkModuleOptions(new RecordingModel())), OrphanModule],
			})
				.compile()
				.then((module) => module.init()),
		).rejects.toThrow(UnregisteredToolError);
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
