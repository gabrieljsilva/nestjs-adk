/**
 * Where the text of a prompt comes from.
 *
 * One source is declared for the whole module and every agent renders through it. The
 * default reads `.md` files from a directory, which is what a repository of prompts usually
 * is; implement this to serve them from a database, a bundle or a remote store instead.
 *
 * ```ts
 * export class TablePrompts extends PromptSource {
 *   public constructor(private readonly db: Database) { super(); }
 *
 *   public async load(name: string): Promise<string | undefined> {
 *     const row = await this.db.prompts.findByName(name);
 *     return row?.body;
 *   }
 *
 *   public describe(name: string): string {
 *     return `prompts table, name = ${name}`;
 *   }
 * }
 * ```
 *
 * Replacing the source changes nothing about the agents. They pass a name and never a
 * location, so the same `renderFromFileOrFail("support.md")` reads a bucket, a table or a
 * disk depending only on what the module declared, and the connection stays inside the
 * source that holds it.
 *
 * A source is not needed to build a prompt from text an application already has:
 * `this.prompting.render(text, vars)` interpolates a string from anywhere, including a row
 * this port would have fetched. Implement the port when the lookup by name is what you want
 * to reuse across agents.
 *
 * Returning `undefined` is a normal answer and not a failure. `renderFromFile` answers
 * `undefined` in turn, and `renderFromFileOrFail` is the one that throws.
 *
 * Three things are yours rather than the runtime's, and a remote source needs all three:
 *
 * - **Caching.** Nothing above this port remembers anything. A prompt is resolved once per
 *   agent per run, so a source that reads the network every time puts a round trip in front
 *   of every conversation. `PromptFileCache` is exported for this: it stores the read rather
 *   than its result, so concurrent runs share one, and it keeps neither an absence nor a
 *   failure. `FileSystemPromptSource` is one line of it.
 * - **Failure.** Whatever `load` throws ends the run, on purpose: an agent answering without
 *   the instruction it was written around is worse than a run that says why it stopped. A
 *   source that would rather degrade than fail decides that here, by answering a bundled
 *   copy or a stale one instead of throwing.
 * - **Construction.** The module takes an instance and not a token, so this is built by the
 *   application before the container exists, like `storage` and `pricing`. Whatever it
 *   depends on is built by hand alongside it.
 */
export abstract class PromptSource {
	/**
	 * The template stored under this name, or `undefined` when this source has none.
	 *
	 * Called once per agent per run, never per turn. Cache inside it when the lookup costs
	 * anything: see the note on the class.
	 */
	public abstract load(name: string): Promise<string | undefined>;

	/**
	 * Where this source looked, for an error a developer can act on.
	 *
	 * The name alone is rarely enough to explain an absence: a relative path resolves against
	 * something, and which something is the answer. Override it whenever the lookup is not
	 * literally the name.
	 */
	public describe(name: string): string {
		return name;
	}
}
