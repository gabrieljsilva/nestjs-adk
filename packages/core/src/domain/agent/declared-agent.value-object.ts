import type { AgentDefinition } from "./agent-definition.value-object";

/** An agent the application declared, next to the name of the provider that declared it. */
export class DeclaredAgent {
	public constructor(
		public readonly definition: AgentDefinition,
		public readonly providerName: string,
	) {}
}
