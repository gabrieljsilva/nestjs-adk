import type { AgentDelegationPolicy } from "../../domain/agent/agent-delegation.policy";
import { ToolEffect } from "../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../domain/tool/invocation/parsed-arguments.value-object";
import { ToolHandler } from "../../domain/tool/invocation/tool-handler.contract";
import { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../domain/tool/tool-schema.contract";
import { DelegationRequest } from "./delegation-request.value-object";

const NAME = "delegate_to_agent";

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
		);
	}

	public static requestIn(toolName: string, args: Record<string, unknown>): DelegationRequest | undefined {
		if (toolName !== NAME) return undefined;
		const agent = args.agentName;
		const task = args.task;
		if (typeof agent !== "string" || typeof task !== "string") return undefined;
		return new DelegationRequest(agent, task);
	}
}

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

class UnreachableHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		throw new Error("a delegation is run by the runtime, never by the tool handler");
	}
}
