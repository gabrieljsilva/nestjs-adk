import { describe, expect, it } from "vitest";
import { AgentDefinition } from "../../domain/agent/agent-definition";
import { AgentDescription } from "../../domain/agent/agent-description";
import { AgentName } from "../../domain/agent/agent-name";
import { DeclaredAgent } from "../../domain/agent/declared-agent";
import { AgentCatalog } from "../../runtime/catalog/agent-catalog";
import { AgentNotInCatalogError } from "../../runtime/catalog/errors/agent-not-in-catalog.error";
import type { RuntimeServices } from "../../runtime/composition/runtime-services";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { AgentRegistry } from "./agent-registry";

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

describe("AgentRegistry", () => {
	it("lists what the application declared", () => {
		expect(new AgentRegistry(runtimeWith("support", "billing")).names).toEqual(["support", "billing"]);
	});

	it("hands back the same handle for the same agent", () => {
		const registry = new AgentRegistry(runtimeWith("support"));

		expect(registry.get("support")).toBe(registry.get("support"));
	});

	it("finds an agent however its name was written", () => {
		const registry = new AgentRegistry(runtimeWith("support-agent"));

		expect(registry.get("Support Agent").name.value).toBe("support-agent");
	});

	it("refuses a name nobody declared, saying which exist", () => {
		const registry = new AgentRegistry(runtimeWith("support"));

		expect(() => registry.get("nobody")).toThrow(AgentNotInCatalogError);
	});
});
