import type { AgentTransferPolicy } from "../../domain/agent/agent-transfer-policy";
import { ParsedArguments } from "../../domain/tool/parsed-arguments";
import { ToolDefinition } from "../../domain/tool/tool-definition";
import { ToolEffect } from "../../domain/tool/tool-effect";
import { ToolHandler } from "../../domain/tool/tool-handler";
import { ToolSchema } from "../../domain/tool/tool-schema";

const NAME = "transfer_to_agent";

/**
 * The tool a model calls when the question belongs to somebody else.
 *
 * It is only ever declared to an agent that named at least one target, and its schema
 * offers exactly those names. A model cannot reach an agent by inventing a name, because
 * an undeclared target never reaches the handler: it fails as invalid arguments, and
 * nothing about a refused handover is journaled.
 *
 * The tool itself changes nothing. It answers that the handover was accepted, and the
 * runtime is what actually moves the session, because a tool is a value with no handle
 * onto the run it is running inside.
 */
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

	/** The name a successful call handed the session to, or nothing when it was not that call. */
	public static targetOf(toolName: string, args: Record<string, unknown>): string | undefined {
		if (toolName !== NAME) return undefined;
		const target = args.agentName;
		return typeof target === "string" ? target : undefined;
	}
}

/** Accepts only an agent this one declared a transfer to. */
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

/**
 * Confirms the handover to the model and does nothing else.
 * What the model reads next is the answer of whoever received the session, so this result
 * only has to be true and short.
 */
class TransferHandler extends ToolHandler {
	public async invoke(args: Record<string, unknown>): Promise<unknown> {
		return { transferredTo: String(args.agentName) };
	}
}
