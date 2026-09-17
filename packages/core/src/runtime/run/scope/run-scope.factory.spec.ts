import { describe, expect, it } from "vitest";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { Instant } from "../../../common/time/instant.value-object";
import { AgentDefinition } from "../../../domain/agent/agent-definition.value-object";
import { AgentDescription } from "../../../domain/agent/agent-description.value-object";
import { AgentExecutionPolicies } from "../../../domain/agent/agent-execution-policies.value-object";
import { AdkCompactionPolicy } from "../../../domain/context/adk-compaction.policy";
import { CompactionDecision } from "../../../domain/context/compaction-decision.value-object";
import { WindowShareCompactionPolicy } from "../../../domain/context/window-share-compaction.policy";
import { PromptBuilder } from "../../../domain/prompt/prompt-builder.contract";
import type { PromptContext } from "../../../domain/prompt/prompt-context.value-object";
import { PromptInstructions } from "../../../domain/prompt/prompt-instructions.value-object";
import { MetadataKey } from "../../../domain/session/metadata/metadata-key.value-object";
import { SessionMetadata } from "../../../domain/session/metadata/session-metadata.value-object";
import { RunLimits } from "../../../domain/session/run/run-limits.value-object";
import { SkillDefinition } from "../../../domain/skill/skill-definition.value-object";
import { Actor } from "../../../domain/tool/access/actor.value-object";
import { ToolEffect } from "../../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../../domain/tool/invocation/parsed-arguments.value-object";
import { ToolHandler } from "../../../domain/tool/invocation/tool-handler.contract";
import { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../../domain/tool/tool-schema.contract";
import { FakeClock } from "../../../support/fake-clock.double";
import { NativeStackFixture } from "../../../support/run/native-stack.fixture";
import { RunContextFixture } from "../../../support/run/run-context.fixture";
import { ScriptedModel } from "../../../support/run/scripted-model.fixture";
import { SequenceIdGenerator } from "../../../support/sequence-id-generator.double";
import { ActiveRunTracker } from "../../lifecycle/active-run-tracker.service";
import { RuntimeLifecycle } from "../../lifecycle/runtime-lifecycle.service";
import { ShutdownOptions } from "../../lifecycle/shutdown.options";
import { AgentRunFactory } from "../agent-run.factory";
import type { StartedRun } from "../settle/started-run.value-object";
import { RunScopeFactory } from "./run-scope.factory";
import type { RunScope } from "./run-scope.value-object";

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

async function scopeOf(factory: RunScopeFactory, definition: AgentDefinition): Promise<RunScope> {
	const started = startedRun();
	return factory.create(runOf(started), definition, model, started);
}

function runOf(started: StartedRun, options: { metadata?: SessionMetadata; actor?: Actor } = {}) {
	return RunContextFixture.run(started.run.sessionId, {
		agent: started.run.agent,
		runId: started.run.id.value,
		metadata: options.metadata,
		actor: options.actor,
		signal: started.cancellation.signal,
	});
}

/** Told apart by identity, because which policy answered is the whole assertion. */
class NamedCompaction extends AdkCompactionPolicy {
	public constructor(public readonly label: string) {
		super();
	}

	public decide(): CompactionDecision {
		return CompactionDecision.skip();
	}
}

const MEMBER = MetadataKey.fromName<string>("memberId", (value): value is string => typeof value === "string");
const METADATA = SessionMetadata.empty().with(MEMBER, "user-7");

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

function compacting(policy: AdkCompactionPolicy | false): AgentDefinition {
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

		const scope = await scopeOf(new RunScopeFactory([readArtifact]), definition);

		expect(scope.catalog.names).toEqual(["lookup_order", "read_artifact"]);
	});

	it("offers nothing at all to an agent that declared nothing to call", async () => {
		const started = startedRun();
		const scope = await new RunScopeFactory([readArtifact]).create(
			runOf(started),
			NativeStackFixture.definitionOf(model),
			model,
			started,
		);

		expect(scope.catalog.names).toEqual([]);
	});

	it("adds what the sources opened, alongside what the agent declared", async () => {
		const definition = NativeStackFixture.definitionOf(model, undefined, [toolOf("lookup_order")]);

		const started = startedRun();
		const scope = await new RunScopeFactory().create(runOf(started), definition, model, started, [
			toolOf("remote_search"),
		]);

		expect(scope.catalog.names).toEqual(["lookup_order", "remote_search"]);
	});

	it("offers the way to load a skill only to an agent that has one to load", async () => {
		const definition = NativeStackFixture.definitionOf(
			model,
			undefined,
			[],
			[SkillDefinition.onDemand("legal", "The terms", "the long terms")],
		);

		const scope = await scopeOf(new RunScopeFactory(), definition);

		expect(scope.catalog.names).toContain("activate_skill");
	});

	it("lets each level replace the one above it, and leaves untouched what a level did not declare", async () => {
		const definition = NativeStackFixture.definitionOf(model);
		const factory = new RunScopeFactory([], RunLimits.of(10, 5));

		const started = startedRun();
		const scope = await factory.create(runOf(started), definition, model, started, [], RunLimits.of(2));

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

		const scope = await scopeOf(factory, bounded(RunLimits.of(16)));

		expect(scope.limits.maxIterations).toBe(16);
	});

	it("keeps an agent that declared none on the module's", async () => {
		const factory = new RunScopeFactory([], RunLimits.of(8));

		const scope = await scopeOf(factory, NativeStackFixture.definitionOf(model));

		expect(scope.limits.maxIterations).toBe(8);
	});

	it("builds the breaker on the limits it resolved, and not on the ones it was given", async () => {
		const factory = new RunScopeFactory([], RunLimits.of(undefined, 1));

		const scope = await scopeOf(factory, NativeStackFixture.definitionOf(model));

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
			const factory = new RunScopeFactory([], RunLimits.unbounded(), moduleWide);

			const scope = await scopeOf(factory, NativeStackFixture.definitionOf(model));

			expect(scope.compaction).toBe(moduleWide);
		});

		it("lets the agent replace it", async () => {
			const factory = new RunScopeFactory([], RunLimits.unbounded(), moduleWide);

			const scope = await scopeOf(factory, compacting(declared));

			expect(scope.compaction).toBe(declared);
		});

		/** Nobody deciding is not nobody compacting: a conversation nobody thought about is still protected. */
		it("falls back to the standard share of the window when neither declared a policy", async () => {
			const scope = await scopeOf(new RunScopeFactory(), NativeStackFixture.definitionOf(model));

			expect(scope.compaction).toBeInstanceOf(WindowShareCompactionPolicy);
		});

		it("compacts nothing for an agent that turned it off", async () => {
			const factory = new RunScopeFactory([], RunLimits.unbounded(), moduleWide);

			const scope = await scopeOf(factory, compacting(false));

			expect(scope.compaction).toBeUndefined();
		});

		it("compacts nothing under a runtime that turned it off", async () => {
			const factory = new RunScopeFactory([], RunLimits.unbounded(), false);

			const scope = await scopeOf(factory, NativeStackFixture.definitionOf(model));

			expect(scope.compaction).toBeUndefined();
		});

		/** The runtime saying no does not answer for an agent that said yes. */
		it("lets an agent compact under a runtime that turned it off", async () => {
			const factory = new RunScopeFactory([], RunLimits.unbounded(), false);

			const scope = await scopeOf(factory, compacting(declared));

			expect(scope.compaction).toBe(declared);
		});

		/** A handover runs under the rules of whoever received the session, not of whoever sent it. */
		it("resolves again for the agent that received a handover", async () => {
			const factory = new RunScopeFactory([], RunLimits.unbounded(), moduleWide);
			const scope = await scopeOf(factory, compacting(declared));

			expect((await factory.switched(scope, NativeStackFixture.definitionOf(model), model)).compaction).toBe(moduleWide);
		});

		it("resolves from scratch for a delegated child", async () => {
			const factory = new RunScopeFactory([], RunLimits.unbounded(), moduleWide);
			const parent = await scopeOf(factory, NativeStackFixture.definitionOf(model));

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
			const scope = await scopeOf(new RunScopeFactory(), prompted("You are support."));

			expect(scope.instructions?.text).toBe("You are support.");
		});

		it("answers nothing for an agent that declared neither", async () => {
			const scope = await scopeOf(new RunScopeFactory(), NativeStackFixture.definitionOf(model));

			expect(scope.instructions).toBeUndefined();
		});

		it("builds the prompt and puts it on the scope", async () => {
			const builder = new CountingPrompt("You are support for Ana.");

			const scope = await scopeOf(new RunScopeFactory(), building(builder));

			expect(scope.instructions?.text).toBe("You are support for Ana.");
		});

		it("calls the agent exactly once, however many turns the run then takes", async () => {
			const builder = new CountingPrompt("You are support.");

			const scope = await scopeOf(new RunScopeFactory(), building(builder));
			scope.instructions;
			scope.instructions;

			expect(builder.calls).toBe(1);
		});

		it("hands the agent the run it is building for", async () => {
			const builder = new CountingPrompt("You are support.");
			const started = startedRun();

			await new RunScopeFactory().create(runOf(started, { metadata: METADATA }), building(builder), model, started);

			expect(builder.seen[0]?.sessionId.value).toBe("s-1");
			expect(builder.seen[0]?.runId.value).toBe(started.run.id.value);
			expect(builder.seen[0]?.agent.value).toBe(NativeStackFixture.AGENT.value);
			expect(builder.seen[0]?.metadata.find(MEMBER)).toBe("user-7");
			expect(builder.seen[0]?.signal).toBe(started.cancellation.signal);
		});

		it("hands the agent who is asking, which is what a prompt naming a workspace reads", async () => {
			const builder = new CountingPrompt("You are support.");
			const actor = Actor.of("u-1", { workspaceId: "w-1" });
			const started = startedRun();

			await new RunScopeFactory().create(runOf(started, { metadata: METADATA, actor }), building(builder), model, started);

			expect(builder.seen[0]?.actor).toBe(actor);
		});

		it("costs no call at all for an agent without a builder", async () => {
			const scope = await scopeOf(new RunScopeFactory(), prompted("You are support."));

			expect(scope.instructions?.text).toBe("You are support.");
		});

		it("ends the run rather than answering without the instruction it was written around", async () => {
			const failing = building(new FailingPrompt());

			await expect(scopeOf(new RunScopeFactory(), failing)).rejects.toThrow("repository is down");
		});

		/** A handover is a different agent answering, so the prompt is that agent's own. */
		it("resolves again for the agent that received a handover, with the metadata it inherited", async () => {
			const receiving = new CountingPrompt("You are billing.");
			const factory = new RunScopeFactory();
			const started = startedRun();
			const scope = await factory.create(
				runOf(started, { metadata: METADATA }),
				prompted("You are support."),
				model,
				started,
			);

			const switched = await factory.switched(scope, building(receiving), model);

			expect(switched.instructions?.text).toBe("You are billing.");
			expect(switched.metadata.find(MEMBER)).toBe("user-7");
			expect(receiving.seen[0]?.metadata.find(MEMBER)).toBe("user-7");
		});

		it("resolves the child's own prompt for a delegation, against the child's run", async () => {
			const child = new CountingPrompt("You are the researcher.");
			const factory = new RunScopeFactory();
			const parentRun = startedRun();
			const parent = await factory.create(
				runOf(parentRun, { metadata: METADATA }),
				prompted("You are support."),
				model,
				parentRun,
			);
			const childRun = startedRun();

			const delegated = await factory.delegated(parent, childRun, building(child), model);

			expect(delegated.instructions?.text).toBe("You are the researcher.");
			expect(child.seen[0]?.runId.value).toBe(childRun.run.id.value);
			expect(child.seen[0]?.metadata.find(MEMBER)).toBe("user-7");
		});
	});
});
