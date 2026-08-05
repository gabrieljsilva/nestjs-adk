import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { Injectable } from "@nestjs/common";

const DEFAULT_PROMPTS_DIR = "./prompts";

/** Own files skipped when detecting the caller's directory in a stack trace. */
const LIB_FRAMES = ["prompt-files", "adk-prompt", "agent.decorator"];

/**
 * Prompt file loading: path resolution, in-memory template cache (one disk read
 * per file, not per run) and {{var}} interpolation.
 */
@Injectable()
export class PromptFiles {
	private static readonly cache = new Map<string, string>();

	/**
	 * Resolution rules:
	 * - "./x" | "../x" → relative to the CALLING file (callerDir), when known;
	 * - plain path     → relative to the module's prompts.dir (default ./prompts), subfolders welcome;
	 * - absolute       → as-is.
	 */
	public resolvePath(path: string, promptsDir?: string, callerDir?: string): string {
		if (isAbsolute(path)) return path;
		if ((path.startsWith("./") || path.startsWith("../")) && callerDir) return resolve(callerDir, path);
		return join(promptsDir ?? DEFAULT_PROMPTS_DIR, path);
	}

	/** Reads (cached) and interpolates. */
	public async render(
		path: string,
		options: { promptsDir?: string; callerDir?: string; vars?: Record<string, unknown> } = {},
	): Promise<string> {
		const absolute = this.resolvePath(path, options.promptsDir, options.callerDir);
		let template = PromptFiles.cache.get(absolute);
		if (template === undefined) {
			template = await readFile(absolute, "utf8");
			PromptFiles.cache.set(absolute, template);
		}
		return options.vars ? this.interpolate(template, options.vars) : template;
	}

	public interpolate(template: string, vars: Record<string, unknown>): string {
		return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ""));
	}

	/** Directory of the first stack frame outside this lib: supports "./" paths relative to the caller's file. */
	public callerDir(): string | undefined {
		const frames = new Error().stack?.split("\n") ?? [];
		for (const frame of frames) {
			const match = frame.match(/\(?([^() ]+?):\d+:\d+\)?$/);
			const file = match?.[1];
			// "\0"-prefixed paths are bundler virtual modules (e.g. injected decorator helpers), never the caller.
			if (!file || file.startsWith("node:") || file.includes("node_modules") || file.includes("\0")) continue;
			if (LIB_FRAMES.some((name) => file.includes(name))) continue;
			return dirname(file);
		}
		return undefined;
	}
}
