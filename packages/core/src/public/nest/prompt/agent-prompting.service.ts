import type { PromptSource } from "../../../contracts/model/prompt-source.contract";
import { PromptNotFoundError } from "../../../domain/prompt/errors/prompt-not-found.error";
import { PromptTemplate } from "../../../domain/prompt/prompt-template.value-object";

/**
 * The prompt toolkit an agent reaches through `this.prompting` inside `prompt()`. `render`
 * interpolates a template the agent already holds; `renderFromFile` loads one by name and
 * `renderFromFileOrFail` is the one to reach for, since an agent without its instruction is
 * worse than one that fails naming the missing file.
 *
 * A required variable nobody filled throws from all three.
 */
export class AgentPrompting {
	public constructor(private readonly source: PromptSource) {}

	public render(template: string, vars?: Record<string, unknown>): string {
		return new PromptTemplate(template).render(vars);
	}

	public async renderFromFile(path: string, vars?: Record<string, unknown>): Promise<string | undefined> {
		const template = await this.source.load(path);
		return template === undefined ? undefined : new PromptTemplate(template, path).render(vars);
	}

	public async renderFromFileOrFail(path: string, vars?: Record<string, unknown>): Promise<string> {
		const rendered = await this.renderFromFile(path, vars);
		if (rendered === undefined) throw new PromptNotFoundError(path, this.source.describe(path));
		return rendered;
	}
}
