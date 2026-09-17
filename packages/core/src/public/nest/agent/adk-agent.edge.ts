import type { AgentName } from "../../../domain/agent/agent-name.value-object";
import type { PromptContext } from "../../../domain/prompt/prompt-context.value-object";
import { AgentHandle } from "../../agent/agent-handle.edge";
import { AgentNotBoundError } from "../../errors/agent-not-bound.error";
import type { AgentPrompting } from "../prompt/agent-prompting.service";

/**
 * An agent an application can inject as itself: the class carries the verbs of `AgentHandle`,
 * so a service asks NestJS for it by type and calls `ask` on it.
 *
 * Override `prompt(context)` when the instruction depends on data the agent injected; it is
 * resolved once per agent per run, and declaring `@Agent({ prompt })` as well fails at boot.
 * A prompt that changes per run is a prompt the provider cannot cache, so keep the variable
 * part small. The handle arrives when the module composes the runtime, and using the agent
 * before that raises `AgentNotBoundError`.
 */
export abstract class AdkAgent extends AgentHandle {
	private prompts?: AgentPrompting;

	public bindTo(handle: AgentHandle, prompting?: AgentPrompting): void {
		this.adopt(handle);
		this.prompts = prompting;
	}

	public get agentName(): AgentName {
		return this.name;
	}

	protected async prompt(_context: PromptContext): Promise<string | undefined> {
		return undefined;
	}

	protected get prompting(): AgentPrompting {
		const prompting = this.prompts;
		if (prompting === undefined) throw new AgentNotBoundError(this.constructor.name);
		return prompting;
	}
}
