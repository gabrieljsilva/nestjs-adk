import type { AgentDelegationPolicy } from "../../domain/agent/agent-delegation-policy";
import { ParsedArguments } from "../../domain/tool/parsed-arguments";
import { ToolDefinition } from "../../domain/tool/tool-definition";
import { ToolEffect } from "../../domain/tool/tool-effect";
import { ToolHandler } from "../../domain/tool/tool-handler";
import { ToolSchema } from "../../domain/tool/tool-schema";
import { DelegationRequest } from "./delegation-request";

const NAME = "delegate_to_agent";

/**
 * The tool a model calls to have somebody else answer one question for it.
 *
 * Unlike a transfer, the conversation stays where it is. The child agent answers the task
 * it was given, its answer arrives as this tool's result, and the agent that asked carries
 * on with it. That is why the task travels as an argument: the child is not reading this
 * conversation, so what it has to do must be said out loud.
 *
 * The handler is never reached. A delegation is a run, and a run is not something a tool
 * can start from inside itself, so the runtime recognizes the call and answers it with what
 * the child produced.
 */
export class DelegateToAgentTool {
	public static readonly NAME = NAME;

	private constructor() {}

	public static forPolicy(policy: AgentDelegationPolicy): ToolDefinition {
		return new ToolDefinition(
			NAME,
			`Hands one task to another agent and reads its answer, keeping this conversation. Available: ${policy.describe()}`,
			new DelegationTargetSchema(policy),
			ToolEffect.READ,
			new UnreachableHandler(),
			true,
		);
	}

	/** The agent and the task a call named, or nothing when it was not a delegation. */
	public static requestIn(toolName: string, args: Record<string, unknown>): DelegationRequest | undefined {
		if (toolName !== NAME) return undefined;
		const agent = args.agentName;
		const task = args.task;
		if (typeof agent !== "string" || typeof task !== "string") return undefined;
		return new DelegationRequest(agent, task);
	}
}

/** Accepts only an agent this one declared a delegation to, and a task in words. */
class DelegationTargetSchema extends ToolSchema {
	public constructor(private readonly policy: AgentDelegationPolicy) {
		super();
	}

	public declaration(): unknown {
		return {
			type: "object",
			properties: {
				agentName: {
					type: "string",
					enum: [...this.policy.names],
					description: "The agent that should do this piece of work.",
				},
				task: {
					type: "string",
					description: "What it has to do, in full: it does not read this conversation.",
				},
			},
			required: ["agentName", "task"],
			additionalProperties: false,
		};
	}

	public parse(args: unknown): ParsedArguments {
		const source = typeof args === "object" && args !== null ? args : {};
		const name = Reflect.get(source, "agentName");
		const task = Reflect.get(source, "task");
		if (typeof name !== "string") return ParsedArguments.invalid("agentName is required and must be a string.");
		if (!this.policy.names.includes(name)) {
			return ParsedArguments.invalid(`this agent cannot delegate to ${name}; available: ${this.policy.describe()}`);
		}
		if (typeof task !== "string" || task.trim().length === 0) {
			return ParsedArguments.invalid("task is required: the agent you delegate to does not read this conversation.");
		}
		return ParsedArguments.valid({ agentName: name, task });
	}
}

/**
 * Refuses to be the one that answers.
 * Reaching it would mean the runtime failed to recognize a delegation and a model was
 * about to be told a task ran when no child run ever existed.
 */
class UnreachableHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		throw new Error("a delegation is run by the runtime, never by the tool handler");
	}
}
