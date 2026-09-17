import type { AgentFailoverPolicy } from "../../../domain/agent/agent-failover-policy";
import type { AdkCompactionPolicy } from "../../../domain/context/adk-compaction-policy";
import type { LlmModel } from "../../../domain/model/llm-model";
import type { RunLimits } from "../../../domain/session/run/run-limits";

/**
 * What `@Agent` declares.
 *
 * The name and the description are the two things a runtime cannot invent: the name is how
 * anything reaches this agent, and the description is what another agent reads when
 * deciding whether to hand it work. Everything else has an answer without the developer.
 *
 * `tools` lists classes, because that is what a NestJS application has at hand when it
 * writes the decorator, or the names those classes declared, for when importing one would
 * tie two modules into a cycle. Turning them into definitions happens after the container
 * is built, where the instances exist.
 */
export interface AgentOptions {
	name: string;
	description: string;
	/** The prompt this agent runs under, verbatim. */
	prompt?: string;
	/** Classes decorated with `@Tool`, each already a provider of its own, or the names they declared. */
	tools?: readonly unknown[];
	/** Answers for this agent alone; without one it answers on the module's default. */
	model?: LlmModel;
	/**
	 * Where a failed model call goes next.
	 *
	 * A list of models is walked in order, one per failure, and a refused request ends the
	 * walk instead of spending the chain on a request every model receives unchanged. A
	 * policy decides for itself. Without either, the first failure ends the run.
	 */
	failover?: readonly LlmModel[] | AgentFailoverPolicy;
	/**
	 * When this agent's context is too long, and how much of it survives.
	 *
	 * Declared here it replaces the module's policy rather than narrowing it, because two
	 * policies deciding how much to keep would be one shortening what the other held on to.
	 * Without one, and without a module policy, the conversation is compacted once it passes
	 * the standard share of the model's window.
	 *
	 * `false` is how an agent says it is never to be shortened, which is a different statement
	 * from saying nothing: an agent whose every word has to reach the model keeps them all and
	 * fails against the window instead of quietly losing the beginning of the conversation.
	 */
	compaction?: AdkCompactionPolicy | false;
	/**
	 * How far a run of this agent may go before the runtime stops it.
	 *
	 * Each limit declared here replaces the module's, field by field, and a field left out
	 * keeps whatever the module decided. An agent that needs more round trips than the
	 * default says so here rather than the application widening the ceiling for everyone.
	 */
	limits?: RunLimits;
	/**
	 * The shape this agent answers in, as a JSON schema the provider is told to enforce.
	 *
	 * Declared here and not per call on purpose. A transfer, a delegation and the turn that
	 * follows an approval each build their scope without the command that started the run, so a
	 * schema passed to `ask` would be silently absent in exactly the places a long run reaches.
	 * An agent that answers data answers data every time it is asked.
	 *
	 * The model has to support it: one that does not declare `STRUCTURED_OUTPUT` fails the run
	 * rather than answering prose that nobody checked. Providers differ on what they accept —
	 * OpenAI enforces only the strict subset, with every object closed and every property
	 * required — and the adapter is what refuses a schema its provider would reject.
	 *
	 * ```ts
	 * @Agent({
	 *   name: "titler",
	 *   description: "...",
	 *   outputSchema: {
	 *     type: "object",
	 *     properties: { title: { type: "string" } },
	 *     required: ["title"],
	 *     additionalProperties: false,
	 *   },
	 * })
	 * ```
	 */
	outputSchema?: object;
}
