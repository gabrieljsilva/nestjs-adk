import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { AGENT_METADATA } from "../../adapters/nest/metadata-keys";
import { ScannedProvider } from "../../adapters/nest/scanned-provider";
import { PromptSource } from "../../contracts/prompt-source";
import { AgentDefinition } from "../../domain/agent/agent-definition";
import { AgentDescription } from "../../domain/agent/agent-description";
import { AgentName } from "../../domain/agent/agent-name";
import { DeclaredAgent } from "../../domain/agent/declared-agent";
import { AgentCatalog } from "../../runtime/catalog/agent-catalog";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import type { StartedRuntime } from "../adk-runtime-host";
import { AdkAgent } from "./adk-agent";
import { AgentBinder } from "./agent-binder";
import { AgentPrompting } from "./agent-prompting";
import { AgentRegistry } from "./agent-registry";
import { AgentNotBoundError } from "./errors/agent-not-bound.error";

/** Reaches the protected toolkit, which is what an overridden `prompt()` does. */
class SupportAgent extends AdkAgent {
	public reachPrompting(): AgentPrompting {
		return this.prompting;
	}
}
class BillingAgent extends SupportAgent {}
class PlainService {}

class EmptyPrompts extends PromptSource {
	public async load(): Promise<string | undefined> {
		return undefined;
	}
}

function hostWith(...names: readonly string[]): StartedRuntime {
	const model = new ScriptedModel("primary");
	const catalog = AgentCatalog.of(
		names.map((name) => {
			const agent = AgentName.from(name);
			return new DeclaredAgent(
				AgentDefinition.of(agent, AgentDescription.from(`${name} agent`, name), model),
				`${name}Provider`,
			);
		}),
	);
	return { runtime: Object.assign(Object.create(null), { catalog }) };
}

function provider(type: object, instance: object, agentName?: string): ScannedProvider {
	if (agentName !== undefined) Reflect.defineMetadata(AGENT_METADATA, { name: agentName }, type);
	return new ScannedProvider(String(Reflect.get(type, "name")), type, instance);
}

describe("AgentBinder", () => {
	it("hands an agent class the handle for the agent it declared", () => {
		const registry = new AgentRegistry(hostWith("support"));
		const instance = new SupportAgent();

		const bound = new AgentBinder(registry).bind([provider(SupportAgent, instance, "support")]);

		expect(bound).toBe(1);
		expect(instance.agentName.value).toBe("support");
	});

	it("hands out the registry's own handle, so both ways reach the same conversation", () => {
		const registry = new AgentRegistry(hostWith("support"));
		const instance = new SupportAgent();

		new AgentBinder(registry).bind([provider(SupportAgent, instance, "support")]);

		expect(instance.agentName).toBe(registry.get("support").name);
	});

	it("skips a provider that is not an agent class", () => {
		const registry = new AgentRegistry(hostWith("support"));

		expect(new AgentBinder(registry).bind([provider(PlainService, new PlainService())])).toBe(0);
	});

	it("skips an agent class that never extended the base, because the registry is the other way", () => {
		const registry = new AgentRegistry(hostWith("support"));
		class DetachedAgent {}

		expect(new AgentBinder(registry).bind([provider(DetachedAgent, new DetachedAgent(), "support")])).toBe(0);
	});

	it("leaves an unbound agent saying so, instead of answering half wired", async () => {
		const instance = new SupportAgent();

		await expect(instance.ask("hi")).rejects.toBeInstanceOf(AgentNotBoundError);
	});

	it("hands over the prompting toolkit alongside the handle", () => {
		const registry = new AgentRegistry(hostWith("support"));
		const instance = new SupportAgent();
		const prompting = new AgentPrompting(new EmptyPrompts());

		new AgentBinder(registry, prompting).bind([provider(SupportAgent, instance, "support")]);

		expect(instance.reachPrompting()).toBe(prompting);
	});

	/** Two agents reading the same template read it once, which is the point of sharing it. */
	it("hands every agent the same toolkit, so one file cache serves them all", () => {
		const registry = new AgentRegistry(hostWith("support", "billing"));
		const support = new SupportAgent();
		const billing = new BillingAgent();
		const prompting = new AgentPrompting(new EmptyPrompts());

		new AgentBinder(registry, prompting).bind([
			provider(SupportAgent, support, "support"),
			provider(BillingAgent, billing, "billing"),
		]);

		expect(support.reachPrompting()).toBe(billing.reachPrompting());
	});
});
