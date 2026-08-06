import { AdkError } from "@nestjs-adk/core";

/** A test named an agent the application never declared, which is a typo the boot can catch. */
export class UnknownTestAgentError extends AdkError {
	public readonly code = "UNKNOWN_TEST_AGENT";

	public constructor(
		public readonly agent: string,
		public readonly declared: readonly string[],
	) {
		super(
			`No agent named "${agent}" was declared. Declared agents: ${declared.length === 0 ? "none" : declared.join(", ")}.`,
		);
	}
}
