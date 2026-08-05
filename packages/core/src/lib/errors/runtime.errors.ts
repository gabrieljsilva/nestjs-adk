import type { TokenUsage } from "../types/events";
import { AdkError } from "./adk.error";

/** Runtime errors: thrown from ask()/iterators; they never become events. */

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
		super("No Embedder configured. Set AdkModule.forRoot({ embedder: YourEmbedder }); the lib ships no default.");
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

export class AgentStateInvalidError extends AdkError {
	public readonly code = "AGENT_STATE_INVALID";

	public constructor(
		agent: string,
		public readonly issues: unknown,
		public readonly key?: string,
	) {
		super(
			key
				? `Agent "${agent}" received a value for state key "${key}" that does not match its declared state schema.`
				: `Agent "${agent}" received state that does not match its declared state schema.`,
		);
	}
}

export class AgentStateMissingError extends AdkError {
	public readonly code = "AGENT_STATE_MISSING";

	public constructor(
		agent: string,
		public readonly key: string,
	) {
		super(`Agent "${agent}" requires state key "${key}" but it is absent.`);
	}
}

export class AgentMaxIterationsError extends AdkError {
	public readonly code = "AGENT_MAX_ITERATIONS";

	public constructor(
		agent: string,
		public readonly limit: number,
		public readonly usage: TokenUsage,
		public readonly lastTool?: string,
	) {
		super(
			`Agent "${agent}" exceeded maxIterations (${limit}); the run was aborted.${
				lastTool ? ` Last requested tool: "${lastTool}".` : ""
			}`,
		);
	}
}

/**
 * Two sources in the same run answer to the same name. Fatal and detected before any connection is
 * opened: the name prefixes the tools, so a duplicate would leave the model with two identical tool
 * names and no way to tell which integration it is calling.
 */
export class DuplicateToolSourceError extends AdkError {
	public readonly code = "DUPLICATE_TOOL_SOURCE";

	public constructor(public readonly source: string) {
		super(`Two tool sources named "${source}" were given to the same run; names must be unique.`);
	}
}

/**
 * A tool source could not be reached. The run continues without its tools, same contract as an
 * `optional` server that is down at boot, because one integration being offline is not a reason to
 * refuse the whole conversation.
 */
export class ToolSourceUnavailableError extends AdkError {
	public readonly code = "TOOL_SOURCE_UNAVAILABLE";

	public constructor(
		public readonly source: string,
		cause: unknown,
	) {
		super(`Tool source "${source}" is unavailable; its tools are absent from this run.`, { cause });
	}
}

/**
 * A tool source needs the user to authorize again. Distinct from being unavailable: nothing is
 * broken and retrying will not help, someone has to reconnect. Collected into `RunResult.reauth` so
 * the application can offer that, instead of surfacing as one more failed tool.
 */
export class ToolSourceAuthError extends AdkError {
	public readonly code = "TOOL_SOURCE_AUTH_REQUIRED";

	public constructor(
		public readonly source: string,
		public readonly reason: string,
	) {
		super(`Tool source "${source}" requires re-authorization: ${reason}`);
	}
}

/**
 * The model could not produce arguments matching the tool's schema. Distinct from a repeated
 * failure: the tool never ran, so the fault is in the declaration the model was given, usually a
 * schema too loose to describe what is wanted, or too strict to be satisfiable.
 */
export class ToolInvalidArgsError extends AdkError {
	public readonly code = "TOOL_INVALID_ARGS";

	public constructor(
		agent: string,
		public readonly tool: string,
		public readonly attempts: number,
		public readonly issues: string,
	) {
		super(
			`Tool "${tool}" was called with invalid arguments ${attempts} time(s) on agent "${agent}"; the run was aborted. Last issues: ${issues}`,
		);
	}
}

export class ToolRepeatedFailureError extends AdkError {
	public readonly code = "TOOL_REPEATED_FAILURE";

	public constructor(
		agent: string,
		public readonly tool: string,
		public readonly failures: number,
		cause: unknown,
	) {
		super(`Tool "${tool}" failed ${failures} consecutive times on agent "${agent}"; the run was aborted.`, {
			cause,
		});
	}
}

export class McpConnectionError extends AdkError {
	public readonly code = "MCP_CONNECTION_FAILED";

	public constructor(server: string, cause: unknown) {
		super(`MCP server "${server}" connection failed.`, { cause });
	}
}

/** A refusal, not an availability problem: the target is reachable and must not be reached. */
export class McpBlockedTargetError extends AdkError {
	public readonly code = "MCP_BLOCKED_TARGET";

	public constructor(
		public readonly url: string,
		reason: string,
	) {
		super(`Refusing to connect to "${url}": ${reason}`);
	}
}

export class ApprovalNotFoundError extends AdkError {
	public readonly code = "APPROVAL_NOT_FOUND";

	public constructor(callId: string, sessionId: string) {
		super(`Pending approval "${callId}" was not found in session "${sessionId}".`);
	}
}
