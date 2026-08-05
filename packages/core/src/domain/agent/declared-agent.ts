import type { AgentDefinition } from "./agent-definition";

/**
 * An agent the application declared, next to the name of what declared it.
 *
 * The provider name is carried for one reason: a duplicate has to report both sides
 * by the names the developer wrote, or the failure is not actionable. It lives in the
 * domain so the adapter that discovers agents and the runtime that catalogs them can
 * exchange it without either depending on the other.
 */
export class DeclaredAgent {
	public constructor(
		public readonly definition: AgentDefinition,
		public readonly providerName: string,
	) {}
}
