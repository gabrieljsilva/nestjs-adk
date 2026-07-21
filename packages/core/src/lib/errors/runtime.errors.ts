import { AdkError } from "./adk.error";

/** Runtime errors: thrown from ask()/iterators — they never become events. */

export class AiEmptyResponseError extends AdkError {
	public readonly code = "AI_EMPTY_RESPONSE";

	public constructor(agent: string) {
		super(`Agent "${agent}" finished the run with an empty final response.`);
	}
}

export class ToolExecutionError extends AdkError {
	public readonly code = "TOOL_EXECUTION_FAILED";

	public constructor(
		public readonly tool: string,
		cause: unknown,
	) {
		super(`Tool "${tool}" threw during execution.`, { cause });
	}
}

export class ModelsExhaustedError extends AdkError {
	public readonly code = "MODELS_EXHAUSTED";

	public constructor(public readonly failures: Array<{ target: string; error: unknown }>) {
		super(`Model router exhausted all targets (${failures.map((f) => f.target).join(", ")}).`);
	}
}

export class SessionNotFoundError extends AdkError {
	public readonly code = "SESSION_NOT_FOUND";

	public constructor(sessionId: string) {
		super(`Session "${sessionId}" was not found.`);
	}
}

export class EmbedderNotConfiguredError extends AdkError {
	public readonly code = "EMBEDDER_NOT_CONFIGURED";

	public constructor() {
		super("No Embedder configured. Set AdkModule.forRoot({ embedder: YourEmbedder }) — the lib ships no default.");
	}
}

export class AgentNotFoundError extends AdkError {
	public readonly code = "AGENT_NOT_FOUND";

	public constructor(agent: string) {
		super(`Agent "${agent}" is not registered.`);
	}
}

export class SkillNotFoundError extends AdkError {
	public readonly code = "SKILL_NOT_FOUND";

	public constructor(skill: string, agent: string) {
		super(`Skill "${skill}" requested via load_skill does not exist on agent "${agent}".`);
	}
}

export class OutputValidationError extends AdkError {
	public readonly code = "OUTPUT_VALIDATION_FAILED";

	public constructor(
		agent: string,
		public readonly rawOutput: unknown,
		public readonly issues: unknown,
	) {
		super(`Agent "${agent}" returned output that does not match its declared schema.`);
	}
}

export class McpConnectionError extends AdkError {
	public readonly code = "MCP_CONNECTION_FAILED";

	public constructor(server: string, cause: unknown) {
		super(`MCP server "${server}" connection failed.`, { cause });
	}
}

export class ApprovalNotFoundError extends AdkError {
	public readonly code = "APPROVAL_NOT_FOUND";

	public constructor(callId: string, sessionId: string) {
		super(`Pending approval "${callId}" was not found in session "${sessionId}".`);
	}
}
