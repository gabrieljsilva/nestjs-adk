import { describe, expect, it } from "vitest";
import { AgentDefinition } from "../../../domain/agent/agent-definition.value-object";
import { AgentDescription } from "../../../domain/agent/agent-description.value-object";
import { AgentName } from "../../../domain/agent/agent-name.value-object";
import { DeclaredAgent } from "../../../domain/agent/declared-agent.value-object";
import { AgentCatalog } from "../../../runtime/catalog/agent-catalog.service";
import { AgentNotInCatalogError } from "../../../runtime/catalog/errors/agent-not-in-catalog.error";
import { ScriptedModel } from "../../../support/run/scripted-model.fixture";
import type { StartedRuntime } from "../../adk-runtime.edge";
import { AgentRegistry } from "./agent-registry.service";

/** The registry reads the runtime from the host, so a spec hands it a host and not services. */
function hostWith(...names: readonly string[]): StartedRuntime {
	const model = new ScriptedModel("primary");
	const catalog = new AgentCatalog(
		names.map((name) => {
			const agent = AgentName.from(name);
			return new DeclaredAgent(
				new AgentDefinition({
					name: agent,
					description: AgentDescription.from(`${name} agent`, name),
					model: model,
				}),
				`${name}Provider`,
			);
		}),
	);
	return { runtime: Object.assign(Object.create(null), { catalog }) };
}

describe("AgentRegistry", () => {
	it("lists what the application declared", () => {
		expect(new AgentRegistry(hostWith("support", "billing")).names).toEqual(["support", "billing"]);
	});

	it("hands back the same handle for the same agent", () => {
		const registry = new AgentRegistry(hostWith("support"));

		expect(registry.open("support")).toBe(registry.open("support"));
	});

	it("finds an agent however its name was written", () => {
		const registry = new AgentRegistry(hostWith("support-agent"));

		expect(registry.open("Support Agent").name.value).toBe("support-agent");
	});

	it("refuses a name nobody declared, saying which exist", () => {
		const registry = new AgentRegistry(hostWith("support"));

		expect(() => registry.open("nobody")).toThrow(AgentNotInCatalogError);
	});
});
