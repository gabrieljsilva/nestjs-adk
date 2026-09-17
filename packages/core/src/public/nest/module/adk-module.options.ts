import { FileSystemPromptSource } from "../../../adapters/prompt/file-system-prompt-source.adapter";
import type { IdGenerator } from "../../../common/identity/id-generator.contract";
import type { Clock } from "../../../common/time/clock.contract";
import type { Embedder } from "../../../contracts/model/embedder.contract";
import type { PromptSource } from "../../../contracts/model/prompt-source.contract";
import type { ArtifactStorage } from "../../../contracts/storage/artifact-storage.contract";
import type { SessionStorage } from "../../../contracts/storage/session-storage.contract";
import type { LlmModel } from "../../../domain/model/llm-model.contract";
import { RuntimeOptions, type RuntimeOptionsPatch } from "../../../runtime/composition/runtime.options";

import { ConflictingPromptOptionsError } from "../errors/conflicting-prompt-options.error";

/** The full literal form of the options; `AdkModuleOptions.from` turns one into the class. */
export interface AdkModuleOptionsInput {
	defaultModel?: LlmModel;
	storage?: SessionStorage;
	artifacts?: ArtifactStorage;
	clock?: Clock;
	ids?: IdGenerator;
	runtime?: RuntimeOptions | RuntimeOptionsPatch;
	embedder?: Embedder;
	prompts?: PromptFileOptions;
	promptSource?: PromptSource;
}

/** Where the built in filesystem source looks for a prompt named without a path; `./prompts` by default. */
export interface PromptFileOptions {
	dir: string;
}

/** The fields a caller may name; one left out keeps whatever the options already hold. */
export type AdkModuleOptionsPatch = Partial<AdkModuleOptionsInput>;

/**
 * What an application hands `AdkModule`, and nothing it must hand it: only the default model
 * has no default of its own, so `forRoot({ defaultModel })` is a working runtime with
 * conversations in memory and a system clock.
 *
 * Every port here is a value, so the options can be written where the module is declared. A
 * port that is itself a provider is named through `forRootAsync`, which builds this same
 * object inside the container. Declaring `prompts` and `promptSource` together is refused.
 */
export class AdkModuleOptions {
	public readonly defaultModel?: LlmModel;
	public readonly storage?: SessionStorage;
	public readonly artifacts?: ArtifactStorage;
	public readonly clock?: Clock;
	public readonly ids?: IdGenerator;
	public readonly runtime?: RuntimeOptions;
	public readonly embedder?: Embedder;
	public readonly prompts?: PromptFileOptions;
	public readonly promptSource?: PromptSource;

	public constructor(input: AdkModuleOptionsInput = {}) {
		this.defaultModel = input.defaultModel;
		this.storage = input.storage;
		this.artifacts = input.artifacts;
		this.clock = input.clock;
		this.ids = input.ids;
		this.runtime = AdkModuleOptions.resolveRuntime(input.runtime);
		this.embedder = input.embedder;
		this.prompts = input.prompts;
		this.promptSource = input.promptSource;
	}

	private static resolveRuntime(declared: RuntimeOptions | RuntimeOptionsPatch | undefined): RuntimeOptions | undefined {
		if (declared === undefined) return undefined;
		return declared instanceof RuntimeOptions ? declared : RuntimeOptions.from(declared);
	}

	public static from(input: AdkModuleOptionsInput): AdkModuleOptions {
		return new AdkModuleOptions(input);
	}

	public with(patch: AdkModuleOptionsPatch): AdkModuleOptions {
		return new AdkModuleOptions({
			defaultModel: patch.defaultModel ?? this.defaultModel,
			storage: patch.storage ?? this.storage,
			artifacts: patch.artifacts ?? this.artifacts,
			clock: patch.clock ?? this.clock,
			ids: patch.ids ?? this.ids,
			runtime: patch.runtime ?? this.runtime,
			embedder: patch.embedder ?? this.embedder,
			prompts: patch.prompts ?? this.prompts,
			promptSource: patch.promptSource ?? this.promptSource,
		});
	}

	public resolvePromptSource(): PromptSource {
		if (this.promptSource !== undefined && this.prompts?.dir !== undefined) throw new ConflictingPromptOptionsError();
		return this.promptSource ?? new FileSystemPromptSource(this.prompts?.dir);
	}
}
