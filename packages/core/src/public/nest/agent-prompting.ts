import type { PromptSource } from "../../contracts/prompt-source";
import { PromptNotFoundError } from "../../domain/prompt/errors/prompt-not-found.error";
import { PromptTemplate } from "../../domain/prompt/prompt-template";

/**
 * The prompt toolkit an agent reaches through `this.prompting`.
 *
 * It answers two questions separately, which is why the names read the way they do:
 * `render` is what to do with a template, and `renderFromFile` is where the template came
 * from. An application whose prompts live in a database calls `render` with the row it just
 * read and never implements a `PromptSource` at all.
 *
 * ```ts
 * protected async prompt(context: PromptContext): Promise<string> {
 *   const customer = await this.customers.findByOwner(context.owner);
 *   return this.prompting.renderFromFileOrFail("support.md", { name: customer.name });
 * }
 * ```
 *
 * `render` has no `OrFail` pair because it has no absence to report: the template was handed
 * to it. A required variable nobody filled throws from all three.
 */
export class AgentPrompting {
	public constructor(private readonly source: PromptSource) {}

	/** Interpolates a template this agent already has, from wherever it got it. */
	public render(template: string, vars?: Record<string, unknown>): string {
		return PromptTemplate.of(template).render(vars);
	}

	/** The template under this name, interpolated, or `undefined` when the source has none. */
	public async renderFromFile(path: string, vars?: Record<string, unknown>): Promise<string | undefined> {
		const template = await this.source.load(path);
		return template === undefined ? undefined : PromptTemplate.of(template, path).render(vars);
	}

	/**
	 * The same, for a prompt whose absence is a deployment that is broken.
	 *
	 * This is the one to reach for by default. An agent that answers without the instruction
	 * it was written around is worse than an agent that fails saying which file is missing.
	 */
	public async renderFromFileOrFail(path: string, vars?: Record<string, unknown>): Promise<string> {
		const rendered = await this.renderFromFile(path, vars);
		if (rendered === undefined) throw new PromptNotFoundError(path, this.source.describe(path));
		return rendered;
	}
}
