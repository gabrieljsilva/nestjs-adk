import type { AgentTransferPolicy } from "../../domain/agent/agent-transfer.policy";
import { ToolEffect } from "../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../domain/tool/invocation/parsed-arguments.value-object";
import { ToolHandler } from "../../domain/tool/invocation/tool-handler.contract";
import { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../domain/tool/tool-schema.contract";

const NAME = "transfer_to_agent";

export class TransferToAgentTool {
	public static readonly NAME = NAME;

	private constructor() {}

	public static forPolicy(policy: AgentTransferPolicy): ToolDefinition {
		return new ToolDefinition(
			NAME,
			`Hands the conversation to another agent, which answers from here on. Available: ${policy.describe()}`,
			new TransferTargetSchema(policy),
			ToolEffect.READ,
			new TransferHandler(),
			true,
		);
	}

	public static findTarget(toolName: string, args: Record<string, unknown>): string | undefined {
		if (toolName !== NAME) return undefined;
		const target = args.agentName;
		return typeof target === "string" ? target : undefined;
	}
}

class TransferTargetSchema extends ToolSchema {
	public constructor(private readonly policy: AgentTransferPolicy) {
		super();
	}

	public declaration(): unknown {
		return {
			type: "object",
			properties: {
				agentName: {
					type: "string",
					enum: [...this.policy.names],
					description: "The agent that should answer from here on.",
				},
			},
			required: ["agentName"],
			additionalProperties: false,
		};
	}

	public parse(args: unknown): ParsedArguments {
		const name = typeof args === "object" && args !== null ? Reflect.get(args, "agentName") : undefined;
		if (typeof name !== "string") return ParsedArguments.invalid("agentName is required and must be a string.");
		if (!this.policy.names.includes(name)) {
			return ParsedArguments.invalid(`this agent cannot transfer to ${name}; available: ${this.policy.describe()}`);
		}
		return ParsedArguments.valid({ agentName: name });
	}
}

class TransferHandler extends ToolHandler {
	public async invoke(args: Record<string, unknown>): Promise<unknown> {
		return { transferredTo: String(args.agentName) };
	}
}
