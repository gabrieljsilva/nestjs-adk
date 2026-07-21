import { AdkError } from "./adk.error";

/** Configuration errors: thrown at boot (onApplicationBootstrap), never at runtime. */
export abstract class AdkBootError extends AdkError {}

export class DuplicateAgentNameError extends AdkBootError {
	public readonly code = "DUPLICATE_AGENT_NAME";

	public constructor(name: string, classes: [string, string]) {
		super(`Agent name "${name}" is declared by both ${classes[0]} and ${classes[1]}. Agent names must be unique.`);
	}
}

export class ReservedMethodError extends AdkBootError {
	public readonly code = "RESERVED_METHOD";

	public constructor(agentClass: string, method: string) {
		super(
			`Agent ${agentClass} declares a method "${method}", which shadows the execution handle inherited from AdkAgent/AdkWorkflow (ask/stream/approve/reject). Rename the method.`,
		);
	}
}

export class UnregisteredToolError extends AdkBootError {
	public readonly code = "UNREGISTERED_TOOL";

	public constructor(agentClass: string, toolClass: string) {
		super(
			`Agent ${agentClass} references tool ${toolClass}, but it is not registered as a provider in any module. ` +
				`Add ${toolClass} to a module's providers.`,
		);
	}
}

export class UnregisteredSkillError extends AdkBootError {
	public readonly code = "UNREGISTERED_SKILL";

	public constructor(agentClass: string, skillClass: string) {
		super(
			`Agent ${agentClass} references skill ${skillClass}, but it is not registered as a provider in any module. ` +
				`Add ${skillClass} to a module's providers.`,
		);
	}
}

export class UnregisteredSubAgentError extends AdkBootError {
	public readonly code = "UNREGISTERED_SUB_AGENT";

	public constructor(agentClass: string, subAgentClass: string) {
		super(
			`Agent ${agentClass} references sub-agent ${subAgentClass}, but it is not registered as a provider in any module.`,
		);
	}
}

export class MissingModelError extends AdkBootError {
	public readonly code = "MISSING_MODEL";

	public constructor(agentClass: string) {
		super(
			`Agent ${agentClass} has no model and AdkModule.forRoot() has no defaultModel. Set @Agent({ model }) or forRoot({ defaultModel }).`,
		);
	}
}

export class InvalidWorkflowError extends AdkBootError {
	public readonly code = "INVALID_WORKFLOW";

	public constructor(workflowClass: string, reason: string) {
		super(`Workflow ${workflowClass} is invalid: ${reason}`);
	}
}

export class ConflictingPromptError extends AdkBootError {
	public readonly code = "CONFLICTING_PROMPT";

	public constructor(agentClass: string) {
		super(`Agent ${agentClass} declares both "prompt" and "promptFile". Pick exactly one.`);
	}
}

export class UnregisteredPromptError extends AdkBootError {
	public readonly code = "UNREGISTERED_PROMPT";

	public constructor(agentClass: string, promptClass: string) {
		super(
			`Agent ${agentClass} references prompt ${promptClass}, but it is not registered as a provider in any module. Add ${promptClass} to a module's providers.`,
		);
	}
}

export class UnresolvedToolsetError extends AdkBootError {
	public readonly code = "UNRESOLVED_TOOLSET";

	public constructor(agentClass: string, toolsetName: string) {
		super(
			`Agent ${agentClass} references toolset "${toolsetName}", but no ToolsetResolver is registered. Import a provider module (e.g. McpModule.forRoot from @nestjs-adk/mcp).`,
		);
	}
}
