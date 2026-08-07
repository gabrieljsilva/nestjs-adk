import { describe, expect, it } from "vitest";
import type { DiscoveredProvider } from "../../adapters/nest/nest-component-discovery";
import { ScannedProvider } from "../../adapters/nest/scanned-provider";
import { PromptInstructions } from "../../domain/prompt/prompt-instructions";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { AdkAgent } from "./adk-agent";
import { AgentPromptScan } from "./agent-prompt-scan";
import { AmbiguousAgentPromptError } from "./errors/ambiguous-agent-prompt.error";
import { MethodPromptBuilder } from "./method-prompt-builder";

class SilentAgent extends AdkAgent {}

class GreetingAgent extends AdkAgent {
	protected override async prompt(): Promise<string> {
		return "You are support.";
	}
}

function discovered(providerName: string, instructions?: string): DiscoveredProvider {
	return {
		providerName,
		metadata: { name: providerName.toLowerCase(), description: `${providerName} agent` },
		model: new ScriptedModel("primary"),
		instructions: instructions === undefined ? undefined : PromptInstructions.from(instructions),
	};
}

function scanned(providerName: string, instance: object): ScannedProvider {
	return new ScannedProvider(providerName, instance.constructor, instance);
}

describe("AgentPromptScan", () => {
	it("attaches a builder to the agent that overrode prompt()", () => {
		const attached = new AgentPromptScan().attach(
			[discovered("GreetingAgent")],
			[scanned("GreetingAgent", new GreetingAgent())],
		);

		expect(attached[0]?.promptBuilder).toBeInstanceOf(MethodPromptBuilder);
	});

	it("leaves an agent that did not override it exactly as it was", () => {
		const provider = discovered("SilentAgent", "You are support.");

		const attached = new AgentPromptScan().attach([provider], [scanned("SilentAgent", new SilentAgent())]);

		expect(attached[0]).toBe(provider);
		expect(attached[0]?.promptBuilder).toBeUndefined();
	});

	it("keeps what the decorator declared next to the builder it did not declare", () => {
		const attached = new AgentPromptScan().attach(
			[discovered("GreetingAgent")],
			[scanned("GreetingAgent", new GreetingAgent())],
		);

		expect(attached[0]?.metadata).toEqual({ name: "greetingagent", description: "GreetingAgent agent" });
	});

	/**
	 * Two prompts is an ambiguity, and any precedence rule would leave one declaration reading
	 * exactly like a configured prompt while the model never receives it.
	 */
	it("refuses an agent that declares a prompt in the decorator and overrides prompt()", () => {
		const scan = () =>
			new AgentPromptScan().attach(
				[discovered("GreetingAgent", "You are support.")],
				[scanned("GreetingAgent", new GreetingAgent())],
			);

		expect(scan).toThrow(AmbiguousAgentPromptError);
		expect(scan).toThrowError(/GreetingAgent/);
	});

	it("matches instances to providers by name, and leaves one it cannot match alone", () => {
		const attached = new AgentPromptScan().attach([discovered("GreetingAgent")], []);

		expect(attached[0]?.promptBuilder).toBeUndefined();
	});
});
