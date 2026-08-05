import type { SessionState } from "../../../domain/session/session-state";

/**
 * Renders a state to the one text that represents it.
 *
 * Two states are equal when this text is equal, which is what every replay assertion
 * relies on. Keys are ordered, absent values are omitted rather than written as null,
 * and nothing about insertion order or object identity can leak in.
 */
export class CanonicalStateSerializer {
	public serialize(state: SessionState): string {
		const values = state.values.entries().map(([key, value]) => [key, value]);
		const activeAgent = state.activeAgent?.value;
		const canonical: Array<[string, unknown]> = [
			["revision", state.revision.value],
			["values", values],
		];
		if (activeAgent !== undefined) canonical.push(["activeAgent", activeAgent]);
		return JSON.stringify(canonical);
	}
}
