import "reflect-metadata";
import { Injectable, Module, type Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { z } from "zod";
import { AdkAgent } from "../abstracts/adk-agent";
import { AdkEngine } from "../abstracts/adk-engine";
import { AdkTool } from "../abstracts/adk-tool";
import { AdkWorkflow } from "../abstracts/adk-workflow";
import { Agent } from "../decorators/agent.decorator";
import { Tool } from "../decorators/tool.decorator";
import { WorkflowAgent } from "../decorators/workflow-agent.decorator";
import {
	ConflictingPromptError,
	DuplicateAgentNameError,
	InvalidWorkflowError,
	MissingModelError,
	ReservedMethodError,
	UnregisteredPromptError,
	UnregisteredSubAgentError,
	UnregisteredToolError,
} from "../errors";
import { AdkModule, type AdkModuleOptions } from "../module/adk.module";
import { AdkPrompt } from "../prompts/adk-prompt";

@Injectable()
class FakeEngine extends AdkEngine {
	public async *run(): AsyncGenerator<never> {}
}

async function bootstrapWith(providers: Type[], options: Partial<AdkModuleOptions> = {}) {
	@Module({ providers })
	class FeatureModule {}

	const moduleRef = await Test.createTestingModule({
		imports: [AdkModule.forRoot({ engine: FakeEngine, defaultModel: "gemini-2.5-flash", ...options }), FeatureModule],
	}).compile();
	await moduleRef.init();
	return moduleRef;
}

describe("AgentRegistry — fail-fast validation at boot", () => {
	it("duplicate agent name → DuplicateAgentNameError", async () => {
		@Agent({ name: "dup", description: "a" })
		class A extends AdkAgent {}
		@Agent({ name: "dup", description: "b" })
		class B extends AdkAgent {}

		await expect(bootstrapWith([A, B])).rejects.toBeInstanceOf(DuplicateAgentNameError);
	});

	it("agent method shadowing the handle API (ask) → ReservedMethodError", async () => {
		@Agent({ name: "shadow", description: "a" })
		class ShadowAgent extends AdkAgent {
			ask() {
				return Promise.resolve(null as never);
			}
		}

		await expect(bootstrapWith([ShadowAgent])).rejects.toBeInstanceOf(ReservedMethodError);
	});

	it("tool referenced but not registered as a provider → UnregisteredToolError", async () => {
		const schema = z.object({ q: z.string() });
		@Tool({ name: "ghost", description: "x", schema })
		class GhostTool extends AdkTool<typeof schema> {
			execute() {
				return null;
			}
		}
		@Agent({ name: "a", description: "a", tools: [GhostTool] })
		class A extends AdkAgent {}

		await expect(bootstrapWith([A])).rejects.toBeInstanceOf(UnregisteredToolError);
	});

	it("unregistered subAgent → UnregisteredSubAgentError", async () => {
		@Agent({ name: "ghost_sub", description: "x" })
		class GhostAgent extends AdkAgent {}
		@Agent({ name: "a", description: "a", subAgents: [GhostAgent] })
		class A extends AdkAgent {}

		await expect(bootstrapWith([A])).rejects.toBeInstanceOf(UnregisteredSubAgentError);
	});

	it("agent without model and module without defaultModel → MissingModelError", async () => {
		@Agent({ name: "a", description: "a" })
		class A extends AdkAgent {}

		await expect(bootstrapWith([A], { defaultModel: undefined })).rejects.toBeInstanceOf(MissingModelError);
	});

	it("workflow with an unregistered agent → InvalidWorkflowError", async () => {
		@Agent({ name: "ghost_wf", description: "x" })
		class GhostAgent extends AdkAgent {}
		@WorkflowAgent({ name: "wf", mode: "sequential", agents: [GhostAgent] })
		class Wf extends AdkWorkflow {}

		await expect(bootstrapWith([Wf])).rejects.toBeInstanceOf(InvalidWorkflowError);
	});

	it("workflow without agents → InvalidWorkflowError", async () => {
		@WorkflowAgent({ name: "wf", mode: "parallel", agents: [] })
		class Wf extends AdkWorkflow {}

		await expect(bootstrapWith([Wf])).rejects.toBeInstanceOf(InvalidWorkflowError);
	});

	it("prompt AND promptFile on the same agent → ConflictingPromptError", async () => {
		@Agent({ name: "a", description: "a", prompt: "text", promptFile: "x.md" })
		class A extends AdkAgent {}

		await expect(bootstrapWith([A])).rejects.toBeInstanceOf(ConflictingPromptError);
	});

	it("AdkPrompt class not registered as a provider → UnregisteredPromptError", async () => {
		class GhostPrompt extends AdkPrompt {
			build() {
				return "x";
			}
		}
		@Agent({ name: "a", description: "a", prompt: GhostPrompt })
		class A extends AdkAgent {}

		await expect(bootstrapWith([A])).rejects.toBeInstanceOf(UnregisteredPromptError);
	});

	it("error message points at the problematic class", async () => {
		const schema = z.object({ q: z.string() });
		@Tool({ name: "ghost", description: "x", schema })
		class GhostTool extends AdkTool<typeof schema> {
			execute() {
				return null;
			}
		}
		@Agent({ name: "my_agent", description: "a", tools: [GhostTool] })
		class MyAgent extends AdkAgent {}

		await expect(bootstrapWith([MyAgent])).rejects.toThrow(/MyAgent.*GhostTool|GhostTool.*MyAgent/);
	});
});
