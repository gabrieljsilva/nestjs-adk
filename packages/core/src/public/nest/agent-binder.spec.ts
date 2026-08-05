import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { AGENT_METADATA } from "../../adapters/nest/metadata-keys";
import { ScannedProvider } from "../../adapters/nest/scanned-provider";
import { AgentDefinition } from "../../domain/agent/agent-definition";
import { AgentDescription } from "../../domain/agent/agent-description";
import { AgentName } from "../../domain/agent/agent-name";
import { DeclaredAgent } from "../../domain/agent/declared-agent";
import { AgentCatalog } from "../../runtime/catalog/agent-catalog";
import type { RuntimeServices } from "../../runtime/composition/runtime-services";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { AdkAgent } from "./adk-agent";
import { AgentBinder } from "./agent-binder";
import { AgentRegistry } from "./agent-registry";
import { AgentNotBoundError } from "./errors/agent-not-bound.error";

class SupportAgent extends AdkAgent {}
class PlainService {}

function runtimeWith(...names: readonly string[]): RuntimeServices {
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
	return Object.assign(Object.create(null), { catalog });
}

function provider(type: object, instance: object, agentName?: string): ScannedProvider {
	if (agentName !== undefined) Reflect.defineMetadata(AGENT_METADATA, { name: agentName }, type);
	return new ScannedProvider(String(Reflect.get(type, "name")), type, instance);
}

describe("AgentBinder", () => {
	it("hands an agent class the handle for the agent it declared", () => {
		const registry = new AgentRegistry(runtimeWith("support"));
		const instance = new SupportAgent();

		const bound = new AgentBinder(registry).bind([provider(SupportAgent, instance, "support")]);

		expect(bound).toBe(1);
		expect(instance.agentName.value).toBe("support");
	});

	it("hands out the registry's own handle, so both ways reach the same conversation", () => {
		const registry = new AgentRegistry(runtimeWith("support"));
		const instance = new SupportAgent();

		new AgentBinder(registry).bind([provider(SupportAgent, instance, "support")]);

		expect(instance.agentName).toBe(registry.get("support").name);
	});

	it("skips a provider that is not an agent class", () => {
		const registry = new AgentRegistry(runtimeWith("support"));

		expect(new AgentBinder(registry).bind([provider(PlainService, new PlainService())])).toBe(0);
	});

	it("skips an agent class that never extended the base, because the registry is the other way", () => {
		const registry = new AgentRegistry(runtimeWith("support"));
		class DetachedAgent {}

		expect(new AgentBinder(registry).bind([provider(DetachedAgent, new DetachedAgent(), "support")])).toBe(0);
	});

	it("leaves an unbound agent saying so, instead of answering half wired", async () => {
		const instance = new SupportAgent();

		await expect(instance.ask("hi")).rejects.toBeInstanceOf(AgentNotBoundError);
	});
});
