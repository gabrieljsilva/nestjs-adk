import {
	ADK_OPTIONS,
	type AdkCompactionPolicy,
	AdkModuleOptions,
	type ContextSummarizer,
	type LlmModel,
	type RunLimits,
	RuntimeOptions,
	type SessionEventConsumer,
	SessionStorage,
	SqliteConnection,
	SqliteSessionStorage,
} from "@nestjs-adk/core";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppModule, storeOptions } from "../app.module";
import { StoreDatabase } from "../shared/store-database";

/** What a test changes about the store it boots, and nothing it must change. */
export interface StoreBoot {
	/** A file, for a store that has to survive being closed and opened again. */
	location?: string;
	consumers?: readonly SessionEventConsumer[];
	limits?: RunLimits;
	/** A ceiling a test can reach: the store's own is measured in tens of thousands of tokens. */
	compaction?: AdkCompactionPolicy;
	/** What replaces the turns compaction drops; the store's own asks a model. */
	summarizer?: ContextSummarizer;
}

/**
 * The real application, with a different model behind it.
 *
 * Nothing is rebuilt here: `AppModule` is imported as it is and three providers are
 * overridden, which is what a consumer of this library does to test its own agents. The
 * runtime options are copied from the ones the store declared, so a test can add a
 * consumer or a limit without quietly turning off the approval policy that holds a
 * refund in front of a human.
 */
export async function bootStore(model: LlmModel, boot: StoreBoot = {}): Promise<TestingModule> {
	const connection = new SqliteConnection(boot.location ?? ":memory:");
	const app = await Test.createTestingModule({ imports: [AppModule] })
		.overrideProvider(StoreDatabase)
		.useValue(new StoreDatabase(connection))
		.overrideProvider(SessionStorage)
		.useValue(new SqliteSessionStorage(connection))
		.overrideProvider(ADK_OPTIONS)
		.useValue(new AdkModuleOptions(model, undefined, undefined, undefined, undefined, runtimeFor(boot)))
		.compile();
	await app.init();
	return app;
}

function runtimeFor(boot: StoreBoot): RuntimeOptions {
	const declared = storeOptions.runtime ?? new RuntimeOptions();
	return new RuntimeOptions(
		declared.shutdown,
		boot.limits ?? declared.limits,
		boot.consumers ?? declared.consumers,
		declared.offload,
		declared.approvals,
		declared.sources,
		declared.snapshots,
		declared.models,
		boot.summarizer ?? declared.summarizer,
		declared.contextNotices,
		declared.consumerNotices,
		boot.compaction ?? declared.compaction,
	);
}
