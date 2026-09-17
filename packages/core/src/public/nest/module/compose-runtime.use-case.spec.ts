import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { ContainerProvider } from "../../../adapters/nest/scanning/nest-provider-scan.service";
import { InMemoryArtifactStorage } from "../../../adapters/storage/in-memory-artifact-storage.adapter";
import { InMemorySessionStorage } from "../../../adapters/storage/in-memory-session-storage.adapter";
import { AgentRunId } from "../../../common/identity/agent-run-id.value-object";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { ModelResolver } from "../../../contracts/model/model-resolver.contract";
import type { AgentDefinition } from "../../../domain/agent/agent-definition.value-object";
import { AgentName } from "../../../domain/agent/agent-name.value-object";
import type { LlmModel } from "../../../domain/model/llm-model.contract";
import { ToolContext } from "../../../domain/tool/invocation/tool-context.value-object";
import { FakeClock } from "../../../support/fake-clock.double";
import { ScriptedModel } from "../../../support/run/scripted-model.fixture";
import { SequenceIdGenerator } from "../../../support/sequence-id-generator.double";
import { AdkRuntime } from "../../adk-runtime.edge";
import { AdkAgent } from "../agent/adk-agent.edge";
import { AgentRegistry } from "../agent/agent-registry.service";
import { Agent } from "../decorators/agent.decorator";
import { McpController } from "../decorators/mcp-controller.decorator";
import { Tool } from "../decorators/tool.decorator";
import { AdkTool } from "../tool/adk.tool";
import { AdkModuleOptions } from "./adk-module.options";
import { ComposeRuntimeUseCase } from "./compose-runtime.use-case";

const schema = z.object({ orderId: z.string() });

class OrdersService {
	public find(orderId: string): unknown {
		return { orderId, status: "shipped" };
	}
}

@Tool({ name: "lookup_order", description: "Finds an order.", schema, effect: "read" })
class LookupOrderTool extends AdkTool<typeof schema> {
	public constructor(private readonly orders: OrdersService) {
		super();
	}

	public execute(input: z.infer<typeof schema>): unknown {
		return this.orders.find(input.orderId);
	}
}

@Agent({ name: "support", description: "Handles orders.", prompt: "Be brief.", tools: [LookupOrderTool] })
class SupportAgent extends AdkAgent {
	public constructor(private readonly orders: OrdersService) {
		super();
	}

	public knows(orderId: string): unknown {
		return this.orders.find(orderId);
	}
}

/** What the container hands over: the class, the instance it built, and its scope. */
const auditSchema = z.object({ since: z.string() });

@McpController({ tools: [LookupOrderTool] })
class OrdersMcpController {
	@Tool({ name: "audit_orders", description: "Lists what changed.", schema: auditSchema, effect: "read" })
	public audit(input: z.infer<typeof auditSchema>): unknown {
		return { since: input.since, changed: 0 };
	}
}

function provider(type: object, instance: object, isStatic = true): ContainerProvider {
	return {
		name: Reflect.get(type, "name"),
		token: type,
		metatype: type,
		instance,
		isDependencyTreeStatic: () => isStatic,
	};
}

function contextOf(): ToolContext {
	return new ToolContext(
		SessionId.from("s-1"),
		AgentRunId.from("r-1"),
		AgentName.from("support"),
		ToolCallId.from("c-1"),
	);
}

let host: AdkRuntime;
let registry: AgentRegistry;
let composer: ComposeRuntimeUseCase;
let agent: SupportAgent;
let tool: LookupOrderTool;

beforeEach(() => {
	host = new AdkRuntime();
	registry = new AgentRegistry(host);
	agent = new SupportAgent(new OrdersService());
	tool = new LookupOrderTool(new OrdersService());
	composer = new ComposeRuntimeUseCase(
		host,
		registry,
		new AdkModuleOptions(new ScriptedModel("primary")),
		new InMemorySessionStorage(),
		new InMemoryArtifactStorage(new SequenceIdGenerator()),
		new FakeClock(),
		new SequenceIdGenerator(),
	);
});

afterEach(async () => {
	await host.stop();
});

describe("ComposeRuntimeUseCase", () => {
	it("composes the runtime from what the container declared", async () => {
		await composer.execute([provider(SupportAgent, agent), provider(LookupOrderTool, tool)]);

		expect(host.isStarted).toBe(true);
		expect(registry.names).toEqual(["support"]);
	});

	it("hands the agent class its handle, so the application injects the class and asks", async () => {
		const bound = await composer.execute([provider(SupportAgent, agent), provider(LookupOrderTool, tool)]);

		expect(bound).toBe(1);
		expect(agent.agentName.value).toBe("support");
	});

	/**
	 * The regression this class exists for.
	 *
	 * A tool is composed around the instance NestJS built, dependencies included. Capturing
	 * anything earlier than a lifecycle hook captures a prototype the container discards,
	 * and the tool then answers "cannot read properties of undefined" to the model.
	 */
	it("composes the tool around the instance that has its dependencies", async () => {
		await composer.execute([provider(SupportAgent, agent), provider(LookupOrderTool, tool)]);

		const definition = host.runtime.catalog.findOrFail(AgentName.from("support")).tools[0];
		expect(await definition?.handler.invoke({ orderId: "A-1042" }, contextOf())).toEqual({
			orderId: "A-1042",
			status: "shipped",
		});
	});

	it("refuses a component the container cannot give one instance of", async () => {
		await expect(composer.execute([provider(SupportAgent, agent, false)])).rejects.toThrow(/SupportAgent/);
	});

	it("hands the runtime the resolver it was constructed with", async () => {
		const resolver = new (class extends ModelResolver {
			public resolve(definition: AgentDefinition): LlmModel {
				return definition.model;
			}
		})();
		const chosen = new ComposeRuntimeUseCase(
			host,
			registry,
			new AdkModuleOptions(new ScriptedModel("primary")),
			new InMemorySessionStorage(),
			new InMemoryArtifactStorage(new SequenceIdGenerator()),
			new FakeClock(),
			new SequenceIdGenerator(),
			resolver,
		);

		await chosen.execute([provider(SupportAgent, agent), provider(LookupOrderTool, tool)]);

		expect(host.runtime.models).toBe(resolver);
	});

	it("scans undeclared agents against the default model it was handed, not the options'", async () => {
		const replacement = new ScriptedModel("replacement");
		const rebased = new ComposeRuntimeUseCase(
			host,
			registry,
			new AdkModuleOptions(new ScriptedModel("primary")),
			new InMemorySessionStorage(),
			new InMemoryArtifactStorage(new SequenceIdGenerator()),
			new FakeClock(),
			new SequenceIdGenerator(),
			undefined,
			[],
			replacement,
		);

		await rebased.execute([provider(SupportAgent, agent), provider(LookupOrderTool, tool)]);

		expect(host.runtime.catalog.findOrFail(AgentName.from("support")).model).toBe(replacement);
	});

	it("publishes what the controllers exposed, next to the agents", async () => {
		await composer.execute([
			provider(SupportAgent, agent),
			provider(LookupOrderTool, tool),
			provider(OrdersMcpController, new OrdersMcpController()),
		]);

		expect(host.runtime.exposed.names).toEqual(["lookup_order", "audit_orders"]);
		expect(host.runtime.exposed.findOrFail("lookup_order")).toBe(
			host.runtime.catalog.findOrFail(AgentName.from("support")).tools[0],
		);
	});

	it("publishes nothing when no controller was declared", async () => {
		await composer.execute([provider(SupportAgent, agent), provider(LookupOrderTool, tool)]);

		expect(host.runtime.exposed.isEmpty).toBe(true);
	});
});
