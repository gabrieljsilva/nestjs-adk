import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../adapters/storage/in-memory-artifact-storage.adapter";
import { InMemorySessionStorage } from "../adapters/storage/in-memory-session-storage.adapter";
import { AgentDefinition } from "../domain/agent/agent-definition.value-object";
import { AgentDescription } from "../domain/agent/agent-description.value-object";
import { AgentName } from "../domain/agent/agent-name.value-object";
import { DeclaredAgent } from "../domain/agent/declared-agent.value-object";
import { FakeClock } from "../support/fake-clock.double";
import { ScriptedModel } from "../support/run/scripted-model.fixture";
import { SequenceIdGenerator } from "../support/sequence-id-generator.double";
import { AdkRuntimeHost } from "./adk-runtime-host.edge";
import { HostNotStartedError } from "./errors/host-not-started.error";

function declared(name: string): DeclaredAgent {
	const agent = AgentName.from(name);
	return new DeclaredAgent(
		AgentDefinition.of(agent, AgentDescription.from(`${name} agent`, name), new ScriptedModel("primary")),
		`${name}Provider`,
	);
}

async function started(host: AdkRuntimeHost, ...names: readonly string[]): Promise<void> {
	await host.start(
		names.map(declared),
		new InMemorySessionStorage(),
		new InMemoryArtifactStorage(new SequenceIdGenerator()),
		new FakeClock(),
		new SequenceIdGenerator(),
	);
}

describe("AdkRuntimeHost", () => {
	/**
	 * The answer anything asking too early gets.
	 *
	 * The module composes on init, so everything the container built before that holds the
	 * host rather than the runtime. Saying it has not started is the honest answer, and it
	 * is what keeps a half composed runtime from ever being handed out.
	 */
	it("refuses to hand out a runtime it has not composed", () => {
		const host = new AdkRuntimeHost();

		expect(host.isStarted).toBe(false);
		expect(() => host.runtime).toThrow(HostNotStartedError);
	});

	it("composes what it was declared, and answers with it afterwards", async () => {
		const host = new AdkRuntimeHost();

		await started(host, "support", "billing");

		expect(host.isStarted).toBe(true);
		expect(host.runtime.catalog.names).toEqual(["support", "billing"]);
		await host.stop();
	});

	it("stops twice without complaining, which is what a double shutdown does", async () => {
		const host = new AdkRuntimeHost();
		await started(host, "support");

		await host.stop();

		await expect(host.stop()).resolves.toBeUndefined();
	});

	it("stops before starting, for an application that failed on the way up", async () => {
		await expect(new AdkRuntimeHost().stop()).resolves.toBeUndefined();
	});
});
