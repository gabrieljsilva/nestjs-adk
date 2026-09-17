/**
 * Where the text of a prompt comes from. One source is declared for the whole module and
 * every agent renders through it by name, never by location.
 *
 * Returning `undefined` is a normal answer and not a failure; whatever `load` throws ends the
 * run. Nothing above this port caches, so a remote source caches inside itself.
 */
export abstract class PromptSource {
	/**
	 * The template stored under this name, or `undefined` when this source has none. Called
	 * once per agent per run, never per turn.
	 */
	public abstract load(name: string): Promise<string | undefined>;

	/**
	 * Where this source looked, for an error a developer can act on. Override it whenever the
	 * lookup is not literally the name.
	 */
	public describe(name: string): string {
		return name;
	}
}
