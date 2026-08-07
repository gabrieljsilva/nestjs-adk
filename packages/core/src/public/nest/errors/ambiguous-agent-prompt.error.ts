import { AdkError } from "../../../common/errors/adk.error";

/**
 * One agent declared its prompt twice, in two different ways.
 *
 * There is no precedence rule on purpose. Whichever way it were resolved, the other
 * declaration would be dead text that reads exactly like a configured prompt, and the
 * developer would be looking at an instruction the model never received.
 */
export class AmbiguousAgentPromptError extends AdkError {
	public readonly code = "AMBIGUOUS_AGENT_PROMPT";

	public constructor(public readonly providerName: string) {
		super(
			`Provider ${providerName} declares a prompt in @Agent and overrides prompt(). Keep one: the decorator for a fixed text, the method for one built per run.`,
		);
	}
}
