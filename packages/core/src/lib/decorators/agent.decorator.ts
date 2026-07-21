import { resolve } from "node:path";
import { Injectable } from "@nestjs/common";
import { AGENT_METADATA } from "../constants";
import { PromptFiles } from "../prompts/prompt-files";
import type { AgentOptions } from "../types/options";

export function Agent(options: AgentOptions): ClassDecorator {
	return (target) => {
		let normalized = options;
		// "./x.md" is relative to THE AGENT'S file — resolve now, while the caller is in the stack.
		if (options.promptFile?.startsWith("./") || options.promptFile?.startsWith("../")) {
			const callerDir = new PromptFiles().callerDir();
			if (callerDir) normalized = { ...options, promptFile: resolve(callerDir, options.promptFile) };
		}
		Reflect.defineMetadata(AGENT_METADATA, normalized, target);
		Injectable()(target as unknown as Parameters<ReturnType<typeof Injectable>>[0]);
	};
}
