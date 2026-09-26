import "reflect-metadata";
import { Module, type Type } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ModelCapabilities } from "../../domain/model/descriptor/model-capabilities.value-object";
import { ModelCapability } from "../../domain/model/descriptor/model-capability.value-object";
import { ModelContextWindow } from "../../domain/model/descriptor/model-context-window.value-object";
import { ModelDescriptor } from "../../domain/model/descriptor/model-descriptor.value-object";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import { LlmModel } from "../../domain/model/llm-model.contract";
import type { ModelRequest } from "../../domain/model/model-request.value-object";
import { ModelChunk } from "../../domain/model/streaming/model-chunk.value-object";
import { ModelUsage } from "../../domain/model/usage/model-usage.value-object";
import { ReadArtifactTool } from "../../runtime/artifact/read-artifact.tool";
import { EditArtifactTool } from "../../runtime/artifact/tools/edit-artifact.tool";
import { ListArtifactsTool } from "../../runtime/artifact/tools/list-artifacts.tool";
import { OutlineArtifactTool } from "../../runtime/artifact/tools/outline-artifact.tool";
import { QueryArtifactTool } from "../../runtime/artifact/tools/query-artifact.tool";
import { SearchArtifactTool } from "../../runtime/artifact/tools/search-artifact.tool";
import { SliceArtifactTool } from "../../runtime/artifact/tools/slice-artifact.tool";
import { DuplicateRuntimeToolNameError } from "../../runtime/catalog/errors/duplicate-runtime-tool-name.error";
import { DelegateToAgentTool } from "../../runtime/delegation/delegate-to-agent.tool";
import { ActivateSkillTool } from "../../runtime/skill/activate-skill.tool";
import { TransferToAgentTool } from "../../runtime/transfer/transfer-to-agent.tool";
import { AdkAgent } from "./agent/adk-agent.edge";
import { Agent } from "./decorators/agent.decorator";
import { Tool } from "./decorators/tool.decorator";
import { AdkModuleOptions } from "./module/adk-module.options";
import { AdkModule } from "./module/adk.module";
import { AdkTool } from "./tool/adk.tool";

/** Reports the tools it was handed, so what an agent actually booted with is read off the wire. */
class RecordingModel extends LlmModel {
	public readonly declared: string[][] = [];

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			new ModelIdentity("acme", "primary"),
			new ModelContextWindow(100_000, 4_000),
			ModelCapabilities.fromEntries([[ModelCapability.TOOLS, true]]),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		this.declared.push(request.tools.map((tool) => tool.name));
		yield ModelChunk.text("done");
		yield ModelChunk.usage(ModelUsage.fromReport(10, 5));
		yield ModelChunk.finish("stop");
	}
}

const ARTIFACT_ARGS = z.object({ artifactId: z.string() });
const ORDER_ARGS = z.object({ id: z.string() });

@Tool({ name: "lookup_order", description: "Finds one order.", schema: ORDER_ARGS })
class LookupOrderTool extends AdkTool<typeof ORDER_ARGS> {
	public execute(): string {
		return "one order";
	}
}

async function boot(model: LlmModel, providers: readonly Type[]): Promise<TestingModule> {
	@Module({ providers: [...providers] })
	class ApplicationModule {}

	const app = await Test.createTestingModule({
		imports: [AdkModule.forRoot(new AdkModuleOptions({ defaultModel: model })), ApplicationModule],
	}).compile();
	await app.init();
	return app;
}

async function bootFailure(providers: readonly Type[]): Promise<unknown> {
	try {
		const app = await boot(new RecordingModel(), providers);
		await app.close();
	} catch (error) {
		return error;
	}
	return undefined;
}

function refusal(raised: unknown): DuplicateRuntimeToolNameError {
	expect(raised).toBeInstanceOf(DuplicateRuntimeToolNameError);
	return raised as DuplicateRuntimeToolNameError;
}

/**
 * A name the runtime owns is bound on every run, after whatever the agent declared, so an
 * application tool under that name used to be dropped with nothing said anywhere. These cases
 * boot the real module, because the mistake is made in a decorator and the only honest question
 * is whether the application starts at all.
 */
describe("an application tool declared under a name the runtime owns", () => {
	it("fails the boot when an agent declares its own read_artifact, a tool no agent ever has to ask for", async () => {
		@Tool({ name: ReadArtifactTool.NAME, description: "Reads our own files.", schema: ARTIFACT_ARGS })
		class OurReadTool extends AdkTool<typeof ARTIFACT_ARGS> {
			public execute(): string {
				return "ours";
			}
		}

		@Agent({ name: "reader", description: "Reads.", prompt: "Be brief.", tools: [OurReadTool] })
		class ReaderAgent extends AdkAgent {}

		const error = refusal(await bootFailure([OurReadTool, ReaderAgent]));

		expect(error.toolName).toBe("read_artifact");
		expect(error.agentName).toBe("reader");
		expect(error.providerName).toBe("ReaderAgent");
	});

	for (const runtimeTool of [
		ListArtifactsTool,
		OutlineArtifactTool,
		SearchArtifactTool,
		QueryArtifactTool,
		SliceArtifactTool,
		EditArtifactTool,
	]) {
		it(`fails the boot when an agent declares its own ${runtimeTool.NAME}, a name the runtime still takes back on every run`, async () => {
			@Tool({ name: runtimeTool.NAME, description: "Ours, under a taken name.", schema: ARTIFACT_ARGS })
			class CollidingTool extends AdkTool<typeof ARTIFACT_ARGS> {
				public execute(): string {
					return "ours";
				}
			}

			@Agent({ name: "reader", description: "Reads.", prompt: "Be brief.", tools: [CollidingTool] })
			class ReaderAgent extends AdkAgent {}

			const error = refusal(await bootFailure([CollidingTool, ReaderAgent]));

			expect(error.toolName).toBe(runtimeTool.NAME);
			expect(error.agentName).toBe("reader");
		});
	}

	for (const runtimeTool of [ActivateSkillTool, TransferToAgentTool, DelegateToAgentTool]) {
		it(`fails the boot when an agent declares its own ${runtimeTool.NAME}, although this agent has no skills, no transfer edges and no delegation edges and would never be handed the runtime's`, async () => {
			@Tool({ name: runtimeTool.NAME, description: "Ours, under a taken name.", schema: ORDER_ARGS })
			class CollidingTool extends AdkTool<typeof ORDER_ARGS> {
				public execute(): string {
					return "ours";
				}
			}

			@Agent({ name: "reader", description: "Reads.", prompt: "Be brief.", tools: [CollidingTool] })
			class ReaderAgent extends AdkAgent {}

			const error = refusal(await bootFailure([CollidingTool, ReaderAgent]));

			expect(error.toolName).toBe(runtimeTool.NAME);
			expect(error.agentName).toBe("reader");
		});
	}

	it("fails the boot when an agent asks for a runtime tool and declares its own under that very name", async () => {
		@Tool({ name: SearchArtifactTool.NAME, description: "Our own search.", schema: ARTIFACT_ARGS })
		class OurSearchTool extends AdkTool<typeof ARTIFACT_ARGS> {
			public execute(): string {
				return "ours";
			}
		}

		@Agent({
			name: "searcher",
			description: "Searches.",
			prompt: "Be brief.",
			tools: [SearchArtifactTool, OurSearchTool],
		})
		class SearcherAgent extends AdkAgent {}

		const error = refusal(await bootFailure([OurSearchTool, SearcherAgent]));

		expect(error.toolName).toBe("search_artifact");
	});

	it("fails the boot for a tool declared on a method of the agent, which never passes through the shared lookup", async () => {
		@Agent({ name: "editor", description: "Edits.", prompt: "Be brief." })
		class EditorAgent extends AdkAgent {
			@Tool({ name: EditArtifactTool.NAME, description: "Our own edit.", schema: ARTIFACT_ARGS })
			public ourEdit(): string {
				return "ours";
			}
		}

		const error = refusal(await bootFailure([EditorAgent]));

		expect(error.toolName).toBe("edit_artifact");
		expect(error.agentName).toBe("editor");
	});

	it("boots an agent that asks for a runtime tool the ordinary way, and still hands it that tool", async () => {
		@Agent({
			name: "searcher",
			description: "Searches.",
			prompt: "Be brief.",
			tools: [LookupOrderTool, SearchArtifactTool],
		})
		class SearcherAgent extends AdkAgent {}

		const model = new RecordingModel();
		const app = await boot(model, [LookupOrderTool, SearcherAgent]);
		await app.get(SearcherAgent).ask("hello");
		await app.close();

		expect(model.declared[0]).toEqual(["lookup_order", "search_artifact", "read_artifact"]);
	});

	it("boots an agent whose tools collide with nothing, leaving what it declared exactly as it was", async () => {
		@Agent({ name: "teller", description: "Tells.", prompt: "Be brief.", tools: [LookupOrderTool] })
		class TellerAgent extends AdkAgent {}

		const model = new RecordingModel();
		const app = await boot(model, [LookupOrderTool, TellerAgent]);
		await app.get(TellerAgent).ask("hello");
		await app.close();

		expect(model.declared[0]).toEqual(["lookup_order", "read_artifact"]);
	});
});
