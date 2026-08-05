import type { ResolvedTool } from "../types/resolved-agent";

/** What a source is told about the run it is being opened for. */
export interface ToolSourceContext {
	agentName: string;
	sessionId?: string;
	userId?: string;
	/** Aborted with the run: a source doing I/O should honour it. */
	signal: AbortSignal;
}

/**
 * A set of tools with a lifetime, supplied per run.
 *
 * `ResolvedTool` already unifies what the model can call: decorated classes and external servers
 * converge on it before the engine, which is why an MCP tool inherits offload, approvals, events and
 * argument validation for free. What has no home is the thing that PRODUCES those tools when it has
 * a connection to open and close: a `@Tool()` class resolves through DI, cannot fail to open and has
 * nothing to shut down, so it stays out of this contract on purpose.
 *
 * Implementations are handed to a single run through `RunInput.sources`, opened while the agent is
 * resolved and closed when the run ends, whether it succeeded, threw or was aborted.
 */
export abstract class AdkToolSource {
	/** Identity within the run: names the source in errors and must be unique among the run's sources. */
	public abstract readonly name: string;

	/**
	 * Connects and reports the tools available for this run.
	 *
	 * Throw `ToolSourceAuthError` when the user has to authorize again, and
	 * `ToolSourceUnavailableError` when the source is simply unreachable; neither ends the run.
	 */
	public abstract open(ctx: ToolSourceContext): Promise<ResolvedTool[]>;

	/** Releases whatever `open` acquired. Called once per run, even when the run failed. */
	public abstract close(): Promise<void>;
}
