import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { Instant } from "../../common/time/instant";
import { AgentDefinition } from "../../domain/agent/agent-definition";
import { AgentDescription } from "../../domain/agent/agent-description";
import { AgentExecutionPolicies } from "../../domain/agent/agent-execution-policies";
import { AdkCompactionPolicy } from "../../domain/context/adk-compaction-policy";
import { CompactionDecision } from "../../domain/context/compaction-decision";
import { PromptBuilder } from "../../domain/prompt/prompt-builder";
import type { PromptContext } from "../../domain/prompt/prompt-context";
import { PromptInstructions } from "../../domain/prompt/prompt-instructions";
import { RunLimits } from "../../domain/session/run-limits";
import { SessionOwner } from "../../domain/session/session-owner";
import { SkillDefinition } from "../../domain/skill/skill-definition";
import { ParsedArguments } from "../../domain/tool/parsed-arguments";
import { ToolDefinition } from "../../domain/tool/tool-definition";
import { ToolEffect } from "../../domain/tool/tool-effect";
import { ToolHandler } from "../../domain/tool/tool-handler";
import { ToolSchema } from "../../domain/tool/tool-schema";
import { FakeClock } from "../../support/fake-clock";
import { NativeStackFixture } from "../../support/run/native-stack.fixture";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { ActiveRunTracker } from "../lifecycle/active-run-tracker";
import { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle";
import { ShutdownOptions } from "../lifecycle/shutdown-options";
import { AgentRunFactory } from "./agent-run-factory";
import { RunScopeFactory } from "./run-scope-factory";
import type { StartedRun } from "./started-run";

const model = new ScriptedModel("primary");

class AnySchema extends ToolSchema {
	public declaration(): unknown {
		return { type: "object" };
	}

	public parse(): ParsedArguments {
		return ParsedArguments.valid({});
	}
}

class SilentHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return {};
	}
}

function toolOf(name: string): ToolDefinition {
	return new ToolDefinition(name, "does something", new AnySchema(), ToolEffect.READ, new SilentHandler());
}

function startedRun(): StartedRun {
	const clock = new FakeClock(Instant.fromIso("2026-01-01T00:00:00.000Z"));
	const tracker = new ActiveRunTracker();
	const lifecycle = new RuntimeLifecycle(tracker, ShutdownOptions.waitIndefinitely(), clock);
	return new AgentRunFactory(new SequenceIdGenerator("run"), clock, tracker, lifecycle).start(
		SessionId.from("s-1"),
		NativeStackFixture.AGENT,
	);
}

const readArtifact = toolOf("read_artifact");

/** Told apart by identity, because which policy answered is the whole assertion. */
class NamedCompaction extends AdkCompactionPolicy {
	public constructor(public readonly label: string) {
		super();
	}

	public decide(): CompactionDecision {
		return CompactionDecision.skip();
	}
}

const OWNER = SessionOwner.from("user-7");

/** Records every context it was handed, because when and how often it was called is the assertion. */
class CountingPrompt extends PromptBuilder {
	public calls = 0;
	public readonly seen: PromptContext[] = [];

	public constructor(private readonly text: string) {
		super();
	}

	public async build(context: PromptContext): Promise<PromptInstructions | undefined> {
		this.calls += 1;
		this.seen.push(context);
		return PromptInstructions.from(this.text);
	}
}

class FailingPrompt extends PromptBuilder {
	public async build(): Promise<PromptInstructions | undefined> {
		throw new Error("the customer repository is down");
	}
}

function prompted(text: string): AgentDefinition {
	return AgentDefinition.of(
		NativeStackFixture.AGENT,
		AgentDescription.from("Support agent", NativeStackFixture.AGENT.value),
		model,
		PromptInstructions.from(text),
	);
}

function building(builder: PromptBuilder): AgentDefinition {
	return AgentDefinition.of(
		NativeStackFixture.AGENT,
		AgentDescription.from("Support agent", NativeStackFixture.AGENT.value),
		model,
		undefined,
		AgentExecutionPolicies.none(),
		[],
		[],
		builder,
	);
}

function compacting(policy: AdkCompactionPolicy): AgentDefinition {
	return AgentDefinition.of(
		NativeStackFixture.AGENT,
		AgentDescription.from("Support agent", NativeStackFixture.AGENT.value),
		model,
		undefined,
		AgentExecutionPolicies.of(undefined, policy),
	);
}

function bounded(limits: RunLimits): AgentDefinition {
	return AgentDefinition.of(
		NativeStackFixture.AGENT,
		AgentDescription.from("Support agent", NativeStackFixture.AGENT.value),
		model,
		undefined,
		AgentExecutionPolicies.of(undefined, undefined, limits),
	);
}

describe("RunScopeFactory", () => {
	it("offers the agent tools together with the ones the runtime always brings", async () => {
		const definition = NativeStackFixture.definitionOf(model, undefined, [toolOf("lookup_order")]);

		const scope = await new RunScopeFactory([readArtifact]).create(definition, model, startedRun());

		expect(scope.catalog.names).toEqual(["lookup_order", "read_artifact"]);
	});

	it("offers nothing at all to an agent that declared nothing to call", async () => {
		const scope = await new RunScopeFactory([readArtifact]).create(
			NativeStackFixture.definitionOf(model),
			model,
			startedRun(),
		);

		expect(scope.catalog.names).toEqual([]);
	});

	it("adds what the sources opened, alongside what the agent declared", async () => {
		const definition = NativeStackFixture.definitionOf(model, undefined, [toolOf("lookup_order")]);

		const scope = await new RunScopeFactory().create(definition, model, startedRun(), [toolOf("remote_search")]);

		expect(scope.catalog.names).toEqual(["lookup_order", "remote_search"]);
	});

	it("offers the way to load a skill only to an agent that has one to load", async () => {
		const definition = NativeStackFixture.definitionOf(
			model,
			undefined,
			[],
			[SkillDefinition.onDemand("legal", "The terms", "the long terms")],
		);

		const scope = await new RunScopeFactory().create(definition, model, startedRun());

		expect(scope.catalog.names).toContain("activate_skill");
	});

	it("lets each level replace the one above it, and leaves untouched what a level did not declare", async () => {
		const definition = NativeStackFixture.definitionOf(model);
		const factory = new RunScopeFactory([], RunLimits.of(10, 5));

		const scope = await factory.create(definition, model, startedRun(), [], RunLimits.of(2));

		expect(scope.limits.maxIterations).toBe(2);
		expect(scope.limits.maxConsecutiveToolFailures).toBe(5);
	});

	/**
	 * Replacing and not capping, which is what makes the field worth declaring: a sector
	 * that genuinely runs longer says so where it is written, instead of the application
	 * raising the module's limit for every agent it has.
	 */
	it("lets an agent that declared more round trips than the module have them", async () => {
		const factory = new RunScopeFactory([], RunLimits.of(8));

		const scope = await factory.create(bounded(RunLimits.of(16)), model, startedRun());

		expect(scope.limits.maxIterations).toBe(16);
	});

	it("keeps an agent that declared none on the module's", async () => {
		const factory = new RunScopeFactory([], RunLimits.of(8));

		const scope = await factory.create(NativeStackFixture.definitionOf(model), model, startedRun());

		expect(scope.limits.maxIterations).toBe(8);
	});

	it("builds the breaker on the limits it resolved, and not on the ones it was given", async () => {
		const factory = new RunScopeFactory([], RunLimits.of(undefined, 1));

		const scope = await factory.create(NativeStackFixture.definitionOf(model), model, startedRun());

		expect(() => scope.breaker.recordFailure("lookup_order", "boom")).toThrow();
	});

	/**
	 * Compaction replaces rather than narrows, which is the one rule it does not share
	 * with limits: two policies deciding how much of a context to keep would be one of
	 * them shortening what the other just decided to hold on to.
	 */
	describe("which compaction policy a run ends up under", () => {
		const moduleWide = new NamedCompaction("module");
		const declared = new NamedCompaction("agent");

		it("hands the module policy to an agent that declared none", async () => {
			const factory = new RunScopeFactory([], RunLimits.none(), moduleWide);

			const scope = await factory.create(NativeStackFixture.definitionOf(model), model, startedRun());

			expect(scope.compaction).toBe(moduleWide);
		});

		it("lets the agent replace it", async () => {
			const factory = new RunScopeFactory([], RunLimits.none(), moduleWide);

			const scope = await factory.create(compacting(declared), model, startedRun());

			expect(scope.compaction).toBe(declared);
		});

		it("compacts nothing when neither declared a policy", async () => {
			const scope = await new RunScopeFactory().create(NativeStackFixture.definitionOf(model), model, startedRun());

			expect(scope.compaction).toBeUndefined();
		});

		/** A handover runs under the rules of whoever received the session, not of whoever sent it. */
		it("resolves again for the agent that received a handover", async () => {
			const factory = new RunScopeFactory([], RunLimits.none(), moduleWide);
			const scope = await factory.create(compacting(declared), model, startedRun());

			expect((await factory.switched(scope, NativeStackFixture.definitionOf(model), model)).compaction).toBe(moduleWide);
		});

		it("resolves from scratch for a delegated child", async () => {
			const factory = new RunScopeFactory([], RunLimits.none(), moduleWide);
			const parent = await factory.create(NativeStackFixture.definitionOf(model), model, startedRun());

			expect((await factory.delegated(parent, startedRun(), compacting(declared), model)).compaction).toBe(declared);
		});
	});

	/**
	 * A scope is born three times in a run's life and each one is a different agent taking
	 * over, which is what makes this the place a prompt is built: once per agent per run, and
	 * never per turn. Resolving it in the loop would rebuild the head of the cached prefix on
	 * every iteration.
	 */
	describe("the prompt a run answers under", () => {
		it("keeps the text the decorator declared when the agent builds nothing", async () => {
			const scope = await new RunScopeFactory().create(prompted("You are support."), model, startedRun());

			expect(scope.instructions?.text).toBe("You are support.");
		});

		it("answers nothing for an agent that declared neither", async () => {
			const scope = await new RunScopeFactory().create(NativeStackFixture.definitionOf(model), model, startedRun());

			expect(scope.instructions).toBeUndefined();
		});

		it("builds the prompt and puts it on the scope", async () => {
			const builder = new CountingPrompt("You are support for Ana.");

			const scope = await new RunScopeFactory().create(building(builder), model, startedRun());

			expect(scope.instructions?.text).toBe("You are support for Ana.");
		});

		it("calls the agent exactly once, however many turns the run then takes", async () => {
			const builder = new CountingPrompt("You are support.");

			const scope = await new RunScopeFactory().create(building(builder), model, startedRun());
			scope.instructions;
			scope.instructions;

			expect(builder.calls).toBe(1);
		});

		it("hands the agent the run it is building for", async () => {
			const builder = new CountingPrompt("You are support.");
			const started = startedRun();

			await new RunScopeFactory().create(building(builder), model, started, [], undefined, OWNER);

			expect(builder.seen[0]?.sessionId.value).toBe("s-1");
			expect(builder.seen[0]?.runId.value).toBe(started.run.id.value);
			expect(builder.seen[0]?.agent.value).toBe(NativeStackFixture.AGENT.value);
			expect(builder.seen[0]?.owner?.value).toBe("user-7");
			expect(builder.seen[0]?.signal).toBe(started.cancellation.signal);
		});

		it("costs no call at all for an agent without a builder", async () => {
			const scope = await new RunScopeFactory().create(prompted("You are support."), model, startedRun());

			expect(scope.instructions?.text).toBe("You are support.");
		});

		it("ends the run rather than answering without the instruction it was written around", async () => {
			const failing = building(new FailingPrompt());

			await expect(new RunScopeFactory().create(failing, model, startedRun())).rejects.toThrow("repository is down");
		});

		/** A handover is a different agent answering, so the prompt is that agent's own. */
		it("resolves again for the agent that received a handover, with the owner it inherited", async () => {
			const receiving = new CountingPrompt("You are billing.");
			const factory = new RunScopeFactory();
			const scope = await factory.create(prompted("You are support."), model, startedRun(), [], undefined, OWNER);

			const switched = await factory.switched(scope, building(receiving), model);

			expect(switched.instructions?.text).toBe("You are billing.");
			expect(switched.owner?.value).toBe("user-7");
			expect(receiving.seen[0]?.owner?.value).toBe("user-7");
		});

		it("resolves the child's own prompt for a delegation, against the child's run", async () => {
			const child = new CountingPrompt("You are the researcher.");
			const factory = new RunScopeFactory();
			const parent = await factory.create(prompted("You are support."), model, startedRun(), [], undefined, OWNER);
			const childRun = startedRun();

			const delegated = await factory.delegated(parent, childRun, building(child), model);

			expect(delegated.instructions?.text).toBe("You are the researcher.");
			expect(child.seen[0]?.runId.value).toBe(childRun.run.id.value);
			expect(child.seen[0]?.owner?.value).toBe("user-7");
		});
	});
});
