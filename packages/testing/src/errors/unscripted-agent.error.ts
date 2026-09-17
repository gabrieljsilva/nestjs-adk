import { AdkError } from "@nestjs-adk/core";

/**
 * A boot was refused because these agents would answer on a model the test did not choose, which
 * is how a free suite would reach a provider by accident. Script them, name a model, or say it
 * out loud with `allowingUnscriptedModels`.
 */
export class UnscriptedAgentError extends AdkError {
	public readonly code = "UNSCRIPTED_AGENT";

	public constructor(public readonly agents: readonly string[]) {
		super(
			`These agents would answer on a model the test did not choose: ${agents.join(", ")}. Script them with withScript, name a model with withAgentModel, or say it out loud with allowingUnscriptedModels().`,
		);
	}
}
