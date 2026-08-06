import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { ContainerProvider } from "../../adapters/nest/nest-provider-scan";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { ModelResolver } from "../../contracts/model-resolver";
import type { AgentDefinition } from "../../domain/agent/agent-definition";
import { AgentName } from "../../domain/agent/agent-name";
import type { LlmModel } from "../../domain/model/llm-model";
import { ToolContext } from "../../domain/tool/tool-context";
import { FakeClock } from "../../support/fake-clock";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { AdkRuntimeHost } from "../adk-runtime-host";
import { AdkAgent } from "./adk-agent";
import { AdkComposer } from "./adk-composer";
import { AdkModuleOptions } from "./adk-module-options";
import { AdkTool } from "./adk-tool";
import { AgentRegistry } from "./agent-registry";
import { Agent } from "./decorators/agent.decorator";
import { Tool } from "./decorators/tool.decorator";

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
function provider(type: object, instance: object, isStatic = true): ContainerProvider {
	return { name: Reflect.get(type, "name"), metatype: type, instance, isDependencyTreeStatic: () => isStatic };
}

function contextOf(): ToolContext {
	return new ToolContext(
		SessionId.from("s-1"),
		AgentRunId.from("r-1"),
		AgentName.from("support"),
		ToolCallId.from("c-1"),
	);
}

let host: AdkRuntimeHost;
let registry: AgentRegistry;
let composer: AdkComposer;
let agent: SupportAgent;
let tool: LookupOrderTool;

beforeEach(() => {
	host = new AdkRuntimeHost();
	registry = new AgentRegistry(host);
	agent = new SupportAgent(new OrdersService());
	tool = new LookupOrderTool(new OrdersService());
	composer = new AdkComposer(
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

describe("AdkComposer", () => {
	it("composes the runtime from what the container declared", async () => {
		await composer.compose([provider(SupportAgent, agent), provider(LookupOrderTool, tool)]);

		expect(host.isStarted).toBe(true);
		expect(registry.names).toEqual(["support"]);
	});

	it("hands the agent class its handle, so the application injects the class and asks", async () => {
		const bound = await composer.compose([provider(SupportAgent, agent), provider(LookupOrderTool, tool)]);

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
		await composer.compose([provider(SupportAgent, agent), provider(LookupOrderTool, tool)]);

		const definition = host.runtime.catalog.findOrFail(AgentName.from("support")).tools[0];
		expect(await definition?.handler.invoke({ orderId: "A-1042" }, contextOf())).toEqual({
			orderId: "A-1042",
			status: "shipped",
		});
	});

	it("refuses a component the container cannot give one instance of", async () => {
		await expect(composer.compose([provider(SupportAgent, agent, false)])).rejects.toThrow(/SupportAgent/);
	});

	it("hands the runtime the resolver it was constructed with", async () => {
		const resolver = new (class extends ModelResolver {
			public resolve(definition: AgentDefinition): LlmModel {
				return definition.model;
			}
		})();
		const chosen = new AdkComposer(
			host,
			registry,
			new AdkModuleOptions(new ScriptedModel("primary")),
			new InMemorySessionStorage(),
			new InMemoryArtifactStorage(new SequenceIdGenerator()),
			new FakeClock(),
			new SequenceIdGenerator(),
			resolver,
		);

		await chosen.compose([provider(SupportAgent, agent), provider(LookupOrderTool, tool)]);

		expect(host.runtime.models).toBe(resolver);
	});

	it("scans undeclared agents against the default model it was handed, not the options'", async () => {
		const replacement = new ScriptedModel("replacement");
		const rebased = new AdkComposer(
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

		await rebased.compose([provider(SupportAgent, agent), provider(LookupOrderTool, tool)]);

		expect(host.runtime.catalog.findOrFail(AgentName.from("support")).model).toBe(replacement);
	});
});
