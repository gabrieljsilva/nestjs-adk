import type { IdGenerator } from "../../common/identity/id-generator";
import type { Clock } from "../../common/time/clock";
import type { ArtifactStorage } from "../../contracts/artifact-storage";
import type { Embedder } from "../../contracts/embedder";
import type { PromptSource } from "../../contracts/prompt-source";
import type { SessionStorage } from "../../contracts/session-storage";
import type { LlmModel } from "../../domain/model/llm-model";
import type { RuntimeOptions } from "../../runtime/composition/runtime-options";

/** The full literal form of the options; `from` turns one into the class. */
export interface AdkModuleOptionsInput {
	/** The model an agent that declared none answers on. */
	defaultModel: LlmModel;
	storage?: SessionStorage;
	artifacts?: ArtifactStorage;
	clock?: Clock;
	ids?: IdGenerator;
	runtime?: RuntimeOptions;
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
 * The three ports are values rather than provider tokens because the module is what wires
 * the container, and asking the container for the things needed to build the container is
 * how a boot order becomes impossible to read.
 */
export class AdkModuleOptions {
	public constructor(
		/** The model an agent that declared none answers on. */
		public readonly defaultModel: LlmModel,
		public readonly storage?: SessionStorage,
		public readonly artifacts?: ArtifactStorage,
		public readonly clock?: Clock,
		public readonly ids?: IdGenerator,
		/** Everything the runtime itself takes: approval policy, limits, consumers, snapshots. */
		public readonly runtime?: RuntimeOptions,
		/** Reachable by injecting `Embedder`. Without one, only code that embeds ever notices. */
		public readonly embedder?: Embedder,
		/** Where the built in filesystem source looks for a prompt named without a path. */
		public readonly prompts?: PromptFileOptions,
		/**
		 * Replaces the filesystem source entirely, for prompts that live somewhere else.
		 *
		 * Declaring this and `prompts` together is refused: `prompts` configures the source this
		 * one replaces, so keeping both would leave a directory declared that nothing reads.
		 */
		public readonly promptSource?: PromptSource,
	) {}

	/** Options built from names instead of positions. */
	public static from(input: AdkModuleOptionsInput): AdkModuleOptions {
		return new AdkModuleOptions(
			input.defaultModel,
			input.storage,
			input.artifacts,
			input.clock,
			input.ids,
			input.runtime,
			input.embedder,
			input.prompts,
			input.promptSource,
		);
	}

	/** A copy with the named fields replaced and every other field kept. */
	public with(patch: AdkModuleOptionsPatch): AdkModuleOptions {
		return new AdkModuleOptions(
			patch.defaultModel ?? this.defaultModel,
			patch.storage ?? this.storage,
			patch.artifacts ?? this.artifacts,
			patch.clock ?? this.clock,
			patch.ids ?? this.ids,
			patch.runtime ?? this.runtime,
			patch.embedder ?? this.embedder,
			patch.prompts ?? this.prompts,
			patch.promptSource ?? this.promptSource,
		);
	}
}
