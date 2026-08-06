import { AdkError } from "@nestjs-adk/core";

/**
 * The bed booted an agent whose model the test never chose.
 *
 * It refuses rather than letting a suite that costs nothing reach a provider by accident,
 * which is what a decorator carrying a real model does to a free test.
 */
export class UnscriptedAgentError extends AdkError {
	public readonly code = "UNSCRIPTED_AGENT";

	public constructor(public readonly agents: readonly string[]) {
		super(
			`These agents would answer on a model the test did not choose: ${agents.join(", ")}. Script them with withScript, name a model with withModelFor, or say it out loud with allowingUnscriptedModels().`,
		);
	}
}
