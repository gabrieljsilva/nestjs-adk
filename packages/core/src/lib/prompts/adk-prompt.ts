import { Inject, Optional } from "@nestjs/common";
import { ADK_OPTIONS } from "../constants";
import type { AdkModuleOptions } from "../module/adk-options";
import type { ToolContext } from "../types/tool-context";
import { PromptFiles } from "./prompt-files";

/** What a prompt builder sees per run: attributes/state from ask(), userId, sessionId. */
export type PromptContext = ToolContext;

/**
 * Prompt builder contract — the AdkTool mirror for instructions.
 * A regular provider: full constructor DI, referenced via @Agent({ prompt: MyPrompt }).
 * build(ctx) returns the final instruction; use fromFile() for .md templates.
 */
export abstract class AdkPrompt {
	@Optional()
	@Inject(ADK_OPTIONS)
	private readonly adkOptions?: AdkModuleOptions;

	private readonly files = new PromptFiles();

	public abstract build(ctx: PromptContext): string | Promise<string>;

	/**
	 * Reads a .md template (cached in memory) and interpolates {{vars}}.
	 * Plain path → module prompts.dir; "./" or "../" → relative to the calling file.
	 */
	protected fromFile(path: string, vars?: Record<string, unknown>): Promise<string> {
		const callerDir = path.startsWith("./") || path.startsWith("../") ? this.files.callerDir() : undefined;
		return this.files.render(path, { promptsDir: this.adkOptions?.prompts?.dir, callerDir, vars });
	}
}
