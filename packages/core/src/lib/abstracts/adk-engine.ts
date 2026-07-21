import type { AgentEvent, RunInput } from "../types/events";
import type { ResolvedAgent } from "../types/resolved-agent";

/**
 * Contract for the execution engine.
 * Adapters (e.g. @nestjs-adk/google) translate the ResolvedAgent into the native runtime and
 * normalize the loop into AgentEvents (with raw.event/raw.response preserved).
 * The core never imports a concrete engine.
 */
export abstract class AdkEngine {
	public abstract run(agent: ResolvedAgent, input: RunInput): AsyncIterable<AgentEvent>;

	/** Deliberate escape hatch: access to the engine's native runtime. */
	public native(): unknown {
		return undefined;
	}
}
