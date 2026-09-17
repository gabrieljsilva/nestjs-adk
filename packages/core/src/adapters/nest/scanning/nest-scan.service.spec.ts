import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ScriptedModel } from "../../../support/run/scripted-model.fixture";
import { AGENT_METADATA } from "../metadata/metadata-keys.token";
import { AgentPromptAttachment } from "./agent-prompt-attachment.contract";
import type { DiscoveredProvider } from "./nest-component-discovery.service";
import type { ContainerProvider } from "./nest-provider-scan.service";
import { NestScanService } from "./nest-scan.service";
import type { ScannedProvider } from "./scanned-provider.value-object";

const MODEL = new ScriptedModel("default");

class ScannedAgent {}
Reflect.defineMetadata(AGENT_METADATA, { name: "support", description: "Handles orders." }, ScannedAgent);

class PlainProvider {}

/** Records that it was asked, and renames the agent so the answer proves it was listened to. */
class RenamingPrompts extends AgentPromptAttachment {
	public calls = 0;

	public attach(
		discovered: readonly DiscoveredProvider[],
		_scanned: readonly ScannedProvider[],
	): readonly DiscoveredProvider[] {
		this.calls += 1;
		return discovered.map((provider) => ({
			...provider,
			metadata: { ...(provider.metadata as object), name: "attached" },
		}));
	}
}

function serviceOf(prompts: AgentPromptAttachment = new RenamingPrompts()): NestScanService {
	return new NestScanService(prompts);
}

const PROVIDERS: ContainerProvider[] = [
	{
		name: "ScannedAgent",
		token: ScannedAgent,
		metatype: ScannedAgent,
		instance: new ScannedAgent(),
		isDependencyTreeStatic: () => true,
	},
	{
		name: "PlainProvider",
		token: PlainProvider,
		metatype: PlainProvider,
		instance: new PlainProvider(),
		isDependencyTreeStatic: () => true,
	},
];

describe("NestScanService", () => {
	it("reads the providers whose declaration can be read, instances included", () => {
		const scanned = serviceOf().readProviders(PROVIDERS);

		expect(scanned.map((provider) => provider.name)).toContain("ScannedAgent");
	});

	it("turns the agents in the container into definitions", () => {
		const service = serviceOf(
			new (class extends AgentPromptAttachment {
				public attach(discovered: readonly DiscoveredProvider[]): readonly DiscoveredProvider[] {
					return discovered;
				}
			})(),
		);
		const scanned = service.readProviders(PROVIDERS);

		const declared = service.readAgents(scanned, MODEL, service.readSharedTools(scanned));

		expect(declared.map((agent) => agent.definition.name.value)).toEqual(["support"]);
	});

	/** The order is the point: what the decorators declared, then the prompts, then the definitions. */
	it("attaches the prompt builders before the definitions are built", () => {
		const prompts = new RenamingPrompts();
		const service = serviceOf(prompts);
		const scanned = service.readProviders(PROVIDERS);

		const declared = service.readAgents(scanned, MODEL, service.readSharedTools(scanned));

		expect(prompts.calls).toBe(1);
		expect(declared[0]?.definition.name.value).toBe("attached");
	});

	it("answers with no exposed tools when nothing published any", () => {
		const service = serviceOf();
		const scanned = service.readProviders(PROVIDERS);

		expect(service.readExposedTools(scanned, service.readSharedTools(scanned))).toEqual([]);
	});
});
