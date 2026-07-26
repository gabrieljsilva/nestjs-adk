import type { InjectionToken, ModuleMetadata, Type } from "@nestjs/common";
import type { AdkEmbedder } from "../abstracts/adk-embedder";
import type { AdkEngine } from "../abstracts/adk-engine";
import type { ArtifactStore } from "../abstracts/artifact-store";
import type { MemoryStore } from "../abstracts/memory-store";
import type { PricingSource } from "../abstracts/pricing-source";
import type { SessionStore } from "../abstracts/session-store";
import type { ModelInput } from "../types/options";

export interface AdkModuleOptions {
	/** Execution engine — AdkEngine contract (e.g.: GoogleAdkEngine from @nestjs-adk/google). */
	engine: Type<AdkEngine>;
	/** Default model for agents without their own `model`. Missing both → MissingModelError at boot. */
	defaultModel?: ModelInput;
	/** Global default SessionStore, overridable per agent. Default: InMemorySessionStore. */
	session?: Type<SessionStore>;
	memory?: Type<MemoryStore>;
	/** Default: InMemoryArtifactStore. */
	artifacts?: Type<ArtifactStore>;
	/** Embedding provider (no default — bring your own; see the playground's GeminiEmbedder example). */
	embedder?: Type<AdkEmbedder>;
	/** Cost tracking. Unset = runs report tokens only. E.g.: `new LiteLLMPricingSource()`. */
	pricing?: PricingSource;
	/** Captures the context sent to the model, for the testing matchers. Off by default — production captures nothing. */
	diagnostics?: boolean;
	prompts?: { dir?: string };
	/**
	 * Structured run logs via the Nest Logger (context `Adk:<agent>`). Cumulative levels:
	 * "info" (run start/done + tokens) < "debug" (+ tool calls/results) < "verbose"
	 * (+ intermediate LLM responses, full payloads). `true` = "info". Reroutes and HITL
	 * pauses always log as warn.
	 */
	logging?: import("../runner/run-logger").LoggingOption;
	/** Global default for Continuity, overridable per agent. */
	context?: import("../models/context-policy").ContextPolicy;
	/** Global defaults for run limits, overridable per agent (@Agent) and per call (ask()). Unset = unlimited. */
	defaults?: {
		maxIterations?: number;
		maxConsecutiveToolFailures?: number;
	};
}

export interface AdkModuleAsyncOptions extends Pick<ModuleMetadata, "imports"> {
	/** The engine stays static (it's a class, not config). The rest can come from a factory. */
	engine: Type<AdkEngine>;
	useFactory: (...args: never[]) => Omit<AdkModuleOptions, "engine"> | Promise<Omit<AdkModuleOptions, "engine">>;
	inject?: InjectionToken[];
}
