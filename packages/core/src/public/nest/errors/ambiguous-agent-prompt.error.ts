import { AdkError } from "../../../common/errors/adk.error";

/** Raised at boot: the agent declares `@Agent({ prompt })` and overrides `prompt()` as well, and a precedence rule would silently ignore one of them. */
export class AmbiguousAgentPromptError extends AdkError {
	public readonly code = "AMBIGUOUS_AGENT_PROMPT";

	public constructor(public readonly providerName: string) {
		super(
			`Provider ${providerName} declares a prompt in @Agent and overrides prompt(). Keep one: the decorator for a fixed text, the method for one built per run.`,
		);
	}
}
