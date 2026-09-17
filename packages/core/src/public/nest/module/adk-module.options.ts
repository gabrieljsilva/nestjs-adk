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

/** The full literal form of the options; `from` turns one into the class. */
export interface AdkModuleOptionsInput {
	/** The model an agent that declared none answers on. Optional: an application whose every
	 * agent declares its own model has nothing to put here, and the scanner refuses at boot
	 * the one agent that declared none. */
	defaultModel?: LlmModel;
	storage?: SessionStorage;
	artifacts?: ArtifactStorage;
	clock?: Clock;
	ids?: IdGenerator;
	/**
	 * Everything the runtime itself takes, as built options or as the plain patch that builds
	 * them: `{ tools: { approvals } }` says the same thing as `RuntimeOptions.from({ ... })`
	 * and says it without a call, which is what a module declaration should read like.
	 */
	runtime?: RuntimeOptions | RuntimeOptionsPatch;
	/** Reachable by injecting `Embedder`. Without one, only code that embeds ever notices. */
	embedder?: Embedder;
	/** Where the built in filesystem source looks for a prompt named without a path. */
	prompts?: PromptFileOptions;
	/** Replaces the filesystem source entirely, for prompts that live somewhere else. */
	promptSource?: PromptSource;
}

/** How the default prompt source finds a file, for an application that keeps them elsewhere. */
export interface PromptFileOptions {
	/** Resolved from the working directory when relative. Defaults to `./prompts`. */
	dir: string;
}

/** The fields a caller may name; one left out keeps whatever the options already hold. */
export type AdkModuleOptionsPatch = Partial<AdkModuleOptionsInput>;

/**
 * What an application hands the module, and nothing it must hand it.
 *
 * Only the default model has no sensible default of its own: everything else composes to
 * something that runs, so `AdkModule.forRoot({ defaultModel })` is a working runtime with
 * sessions in memory and a system clock.
 *
 * Every port here is a value rather than a provider token, so these options can be written
 * where the module is declared, before any container exists. That is the simple case and not
 * the only one: a port that is itself a provider, a storage holding a database client being
 * the usual one, is named through `AdkModule.forRootAsync`, which builds this same object
 * inside the container. What it produces is what `forRoot` was handed, so nothing downstream
 * of the token can tell the two apart.
 */
export class AdkModuleOptions {
	/** The model an agent that declared none answers on. */
	public readonly defaultModel?: LlmModel;
	public readonly storage?: SessionStorage;
	public readonly artifacts?: ArtifactStorage;
	public readonly clock?: Clock;
	public readonly ids?: IdGenerator;
	/** Everything the runtime itself takes: approval policy, limits, consumers, snapshots. */
	public readonly runtime?: RuntimeOptions;
	/** Reachable by injecting `Embedder`. Without one, only code that embeds ever notices. */
	public readonly embedder?: Embedder;
	/** Where the built in filesystem source looks for a prompt named without a path. */
	public readonly prompts?: PromptFileOptions;
	/**
	 * Replaces the filesystem source entirely, for prompts that live somewhere else.
	 *
	 * Declaring this and `prompts` together is refused: `prompts` configures the source this
	 * one replaces, so keeping both would leave a directory declared that nothing reads.
	 */
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

	/** Built options either way, so nothing downstream has to know which form was written. */
	private static resolveRuntime(declared: RuntimeOptions | RuntimeOptionsPatch | undefined): RuntimeOptions | undefined {
		if (declared === undefined) return undefined;
		return declared instanceof RuntimeOptions ? declared : RuntimeOptions.from(declared);
	}

	/** Options built from names instead of positions. */
	public static from(input: AdkModuleOptionsInput): AdkModuleOptions {
		return new AdkModuleOptions(input);
	}

	/** A copy with the named fields replaced and every other field kept. */
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

	/**
	 * The prompt source this module reads from: the application's own, or files under the
	 * directory it named.
	 *
	 * Declaring both is refused rather than resolved by precedence, because a precedence rule
	 * is a declaration silently ignored, and the one ignored here is the one somebody wrote
	 * last.
	 */
	public resolvePromptSource(): PromptSource {
		if (this.promptSource !== undefined && this.prompts?.dir !== undefined) throw new ConflictingPromptOptionsError();
		return this.promptSource ?? new FileSystemPromptSource(this.prompts?.dir);
	}
}
