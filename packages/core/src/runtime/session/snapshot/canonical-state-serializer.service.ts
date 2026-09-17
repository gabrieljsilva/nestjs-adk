import type { SessionState } from "../../../domain/session/state/session-state.value-object";

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
