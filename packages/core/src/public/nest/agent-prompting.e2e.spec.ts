import "reflect-metadata";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Injectable, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { PromptSource } from "../../contracts/prompt-source";
import type { LlmModel } from "../../domain/model/llm-model";
import { MissingPromptVariablesError } from "../../domain/prompt/errors/missing-prompt-variables.error";
import { PromptNotFoundError } from "../../domain/prompt/errors/prompt-not-found.error";
import type { PromptContext } from "../../domain/prompt/prompt-context";
import { FakeClock } from "../../support/fake-clock";
import { RecordingModel } from "../../support/nest/recording-model.fixture";
import { ToolCallingModel } from "../../support/nest/tool-calling-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { AdkAgent } from "./adk-agent";
import { AdkModule } from "./adk-module";
import { AdkModuleOptions } from "./adk-module-options";
import { AgentRegistry } from "./agent-registry";
import { Agent } from "./decorators/agent.decorator";
import { DelegatesTo } from "./decorators/delegates-to.decorator";
import { Skill } from "./decorators/skill.decorator";
import { TransfersTo } from "./decorators/transfers-to.decorator";
import { AmbiguousAgentPromptError } from "./errors/ambiguous-agent-prompt.error";
import { ConflictingPromptOptionsError } from "./errors/conflicting-prompt-options.error";

const PROMPTS = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "prompts");

/** The dependency the prompt is built from, which is the whole reason it is a method. */
@Injectable()
class CustomersService {
	public nameOf(owner?: string): string {
		return owner === "user-7" ? "Ana" : "a guest";
	}
}

@Agent({ name: "billing", description: "Handles money." })
class BillingAgent extends AdkAgent {
	/** Renders a template it already has, so no source is involved at all. */
	protected override async prompt(context: PromptContext): Promise<string> {
		return this.prompting.render("You are billing, on session {{session}}.", { session: context.sessionId.value });
	}
}

@Agent({ name: "research", description: "Looks things up." })
class ResearchAgent extends AdkAgent {
	/** A file with no variables in it, which is most prompts. */
	protected override async prompt(): Promise<string | undefined> {
		return this.prompting.renderFromFile("research.md");
	}
}

@Agent({ name: "support", description: "Handles orders." })
@TransfersTo(BillingAgent)
@DelegatesTo(ResearchAgent)
class SupportAgent extends AdkAgent {
	public readonly seen: PromptContext[] = [];

	public constructor(private readonly customers: CustomersService) {
		super();
	}

	protected override async prompt(context: PromptContext): Promise<string> {
		this.seen.push(context);
		return this.prompting.renderFromFileOrFail("support.md", {
			name: this.customers.nameOf(context.owner?.value),
		});
	}

	@Skill({ name: "tone", description: "Brand tone.", mode: "always" })
	public tone(): string {
		return "Answer in a friendly tone.";
	}
}

@Agent({ name: "silent", description: "Decides from the request alone." })
class SilentAgent extends AdkAgent {}

/** Not extending the base, which is still a way to run an agent: the decorator answers for it. */
@Agent({ name: "legacy", description: "Handles the old flow.", prompt: "You are the legacy desk." })
class LegacyAgent {}

@Agent({ name: "broken", description: "Cannot build its prompt." })
class BrokenAgent extends AdkAgent {
	protected override async prompt(): Promise<string> {
		throw new Error("the customer repository is down");
	}
}

@Agent({ name: "absent", description: "Points at a prompt nobody wrote." })
class AbsentPromptAgent extends AdkAgent {
	protected override async prompt(): Promise<string> {
		return this.prompting.renderFromFileOrFail("nothing-here.md");
	}
}

@Agent({ name: "incomplete", description: "Forgets to fill what the file requires." })
class IncompletePromptAgent extends AdkAgent {
	protected override async prompt(): Promise<string> {
		return this.prompting.renderFromFileOrFail("support.md");
	}
}

@Module({
	providers: [
		CustomersService,
		SupportAgent,
		BillingAgent,
		ResearchAgent,
		SilentAgent,
		LegacyAgent,
		BrokenAgent,
		AbsentPromptAgent,
		IncompletePromptAgent,
	],
})
class PromptingModule {}

describe("an agent that builds its prompt per run", () => {
	let app: TestingModule;

	afterEach(async () => {
		await app?.close();
	});

	async function bootWith(model: LlmModel, options?: Partial<AdkModuleOptions>): Promise<TestingModule> {
		const declared = AdkModuleOptions.from({
			defaultModel: model,
			clock: new FakeClock(),
			ids: new SequenceIdGenerator(),
			prompts: { dir: PROMPTS },
			...options,
		});
		// Kept only once it is up: closing a module whose init failed runs the init hook again,
		// so the boot failure would arrive a second time from the teardown.
		const built = await Test.createTestingModule({
			imports: [AdkModule.forRoot(declared), PromptingModule],
		}).compile();
		await built.init();
		app = built;
		return built;
	}

	it("sends the model what the agent built, from a file and its own dependency", async () => {
		const model = new RecordingModel("hello there");
		const booted = await bootWith(model);

		await booted.get(AgentRegistry).get("support").ask("hi", { owner: "user-7" });

		expect(model.requests[0]?.instructions?.text).toContain("talking to Ana");
	});

	it("hands the agent the session, the run, its own name and the owner", async () => {
		const booted = await bootWith(new RecordingModel());
		const support = booted.get(SupportAgent);

		const result = await support.ask("hi", { owner: "user-7" });

		expect(support.seen[0]?.sessionId.value).toBe(result.sessionId.value);
		expect(support.seen[0]?.runId.value).toBe(result.runId.value);
		expect(support.seen[0]?.agent.value).toBe("support");
		expect(support.seen[0]?.owner?.value).toBe("user-7");
	});

	/** The owner lives on the session, so a conversation continued tomorrow builds for the same person. */
	it("keeps the owner across the turns of a continued conversation", async () => {
		const booted = await bootWith(new RecordingModel());
		const support = booted.get(SupportAgent);

		const first = await support.ask("hi", { owner: "user-7" });
		await support.ask("and then?", first.sessionId);

		expect(support.seen[1]?.owner?.value).toBe("user-7");
	});

	/**
	 * The cost decision the whole design turns on. The system prompt is the head of the
	 * prefix a provider caches, so a prompt rebuilt between turns invalidates everything
	 * after it, and a lookup per turn is a database call per turn.
	 */
	it("builds it once per run, however many turns the run takes", async () => {
		const booted = await bootWith(new ToolCallingModel("delegate_to_agent", { agentName: "research", task: "check" }));
		const support = booted.get(SupportAgent);

		await support.ask("hi", { owner: "user-7" });

		expect(support.seen).toHaveLength(1);
	});

	it("builds it again for the next run on the same session", async () => {
		const booted = await bootWith(new RecordingModel());
		const support = booted.get(SupportAgent);

		const first = await support.ask("hi", { owner: "user-7" });
		await support.ask("again", first.sessionId);

		expect(support.seen).toHaveLength(2);
	});

	it("interpolates a template the agent already had, with no source involved", async () => {
		const model = new RecordingModel();
		const booted = await bootWith(model);

		const result = await booted.get(AgentRegistry).get("billing").ask("how much?");

		expect(model.requests[0]?.instructions?.text).toBe(`You are billing, on session ${result.sessionId.value}.`);
	});

	it("serves a file with no variables in it", async () => {
		const model = new RecordingModel();
		const booted = await bootWith(model);

		await booted.get(AgentRegistry).get("research").ask("what is it?");

		expect(model.requests[0]?.instructions?.text).toBe("You are the research desk. Answer with facts and nothing else.");
	});

	it("keeps the always skills after the prompt, in the order they were declared", async () => {
		const model = new RecordingModel();
		const booted = await bootWith(model);

		await booted.get(AgentRegistry).get("support").ask("hi", { owner: "user-7" });

		const instructions = model.requests[0]?.instructions?.text ?? "";
		expect(instructions.indexOf("talking to Ana")).toBeLessThan(instructions.indexOf("friendly tone"));
	});

	it("runs an agent that declared no prompt at all with no instruction at all", async () => {
		const model = new RecordingModel();
		const booted = await bootWith(model);

		await booted.get(AgentRegistry).get("silent").ask("hi");

		expect(model.requests[0]?.instructions).toBeUndefined();
	});

	it("still answers for an agent that never extended the base, from the decorator", async () => {
		const model = new RecordingModel();
		const booted = await bootWith(model);

		await booted.get(AgentRegistry).get("legacy").ask("hi");

		expect(model.requests[0]?.instructions?.text).toBe("You are the legacy desk.");
	});

	describe("who answers after a handover", () => {
		it("builds the prompt of the agent that received the session", async () => {
			const model = new ToolCallingModel("transfer_to_agent", { agentName: "billing" }, "that is billed");
			const booted = await bootWith(model);

			await booted.get(AgentRegistry).get("support").ask("who charged me?", { owner: "user-7" });

			expect(model.requests[0]?.instructions?.text).toContain("talking to Ana");
			expect(model.requests[1]?.instructions?.text).toContain("You are billing");
		});

		it("builds the child's own prompt for a delegation", async () => {
			const model = new ToolCallingModel("delegate_to_agent", { agentName: "research", task: "check the recall" });
			const booted = await bootWith(model);

			await booted.get(AgentRegistry).get("support").ask("is it recalled?", { owner: "user-7" });

			expect(model.requests[1]?.instructions?.text).toBe("You are the research desk. Answer with facts and nothing else.");
		});
	});

	describe("when the prompt cannot be built", () => {
		/** An agent answering without the instruction it was written around is the worse outcome. */
		it("fails the run with what the agent threw", async () => {
			const booted = await bootWith(new RecordingModel());

			await expect(booted.get(AgentRegistry).get("broken").ask("hi")).rejects.toThrow("the customer repository is down");
		});

		it("fails naming the file when the prompt is not where it was expected", async () => {
			const booted = await bootWith(new RecordingModel());

			await expect(booted.get(AgentRegistry).get("absent").ask("hi")).rejects.toBeInstanceOf(PromptNotFoundError);
		});

		it("fails naming the variable when the file requires one nobody filled", async () => {
			const booted = await bootWith(new RecordingModel());

			await expect(booted.get(AgentRegistry).get("incomplete").ask("hi")).rejects.toBeInstanceOf(
				MissingPromptVariablesError,
			);
		});

		it("asks the model nothing when the prompt failed", async () => {
			const model = new RecordingModel();
			const booted = await bootWith(model);

			await expect(booted.get(AgentRegistry).get("broken").ask("hi")).rejects.toThrow();

			expect(model.requests).toEqual([]);
		});
	});

	describe("where the prompts come from", () => {
		it("reads them from a source the application declared instead of from files", async () => {
			class InMemoryPrompts extends PromptSource {
				public async load(name: string): Promise<string | undefined> {
					return name === "research.md" ? "You are the research desk, served from memory." : undefined;
				}
			}

			const model = new RecordingModel();
			const booted = await bootWith(model, { prompts: undefined, promptSource: new InMemoryPrompts() });

			await booted.get(AgentRegistry).get("research").ask("what is it?");

			expect(model.requests[0]?.instructions?.text).toBe("You are the research desk, served from memory.");
		});

		it("refuses a module that declares a source and a directory for the source it replaced", async () => {
			class InMemoryPrompts extends PromptSource {
				public async load(): Promise<string | undefined> {
					return undefined;
				}
			}

			await expect(bootWith(new RecordingModel(), { promptSource: new InMemoryPrompts() })).rejects.toBeInstanceOf(
				ConflictingPromptOptionsError,
			);
		});
	});

	/** Two prompts is an ambiguity, and the cheapest place to find it is the boot. */
	it("refuses at boot an agent that declares a prompt twice", async () => {
		@Agent({ name: "ambiguous", description: "Declares it twice.", prompt: "You are support." })
		class AmbiguousAgent extends AdkAgent {
			protected override async prompt(): Promise<string> {
				return "You are support, again.";
			}
		}

		@Module({ providers: [AmbiguousAgent] })
		class AmbiguousModule {}

		await expect(
			Test.createTestingModule({
				imports: [AdkModule.forRoot(AdkModuleOptions.from({ defaultModel: new RecordingModel() })), AmbiguousModule],
			})
				.compile()
				.then((module) => module.init()),
		).rejects.toBeInstanceOf(AmbiguousAgentPromptError);
	});
});
