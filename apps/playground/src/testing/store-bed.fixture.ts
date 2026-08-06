import { type LlmModel, SessionStorage, SqliteConnection, SqliteSessionStorage } from "@nestjs-adk/core";
import { AdkTestBedBuilder, type ScriptedModel } from "@nestjs-adk/testing";
import { AppModule } from "../app.module";
import { StoreDatabase } from "../shared/store-database";

/** What a test changes about the store it boots, and nothing it must change. */
export interface StoreBoot {
	/** A file, for a store that has to survive being closed and opened again. */
	location?: string;
}

/**
 * The real application, ready for a test to say what its agents answer.
 *
 * `AppModule` is imported as it is and the database is pointed at memory; everything else
 * the store declared, its approval policy included, stays in force. What a test adds on
 * top is the model of each agent, which is the one thing it has to decide.
 *
 * The store's four agents are named here rather than left to each suite, because a bed
 * refuses to boot with an agent whose model nobody chose, and a suite that had to list
 * them all again would drift the day a fifth sector is added.
 */
export function storeBed(boot: StoreBoot = {}): AdkTestBedBuilder {
	const connection = new SqliteConnection(boot.location ?? ":memory:");
	return AdkTestBedBuilder.for({ imports: [AppModule] })
		.overriding(StoreDatabase, new StoreDatabase(connection))
		.overriding(SessionStorage, new SqliteSessionStorage(connection));
}

/** The store with one model behind every agent, which is what a paid suite boots. */
export function storeBedOn(model: LlmModel, boot: StoreBoot = {}): AdkTestBedBuilder {
	return storeBed(boot)
		.withModel(model)
		.withModelFor("concierge", model)
		.withModelFor("sales", model)
		.withModelFor("warranty", model)
		.withModelFor("billing", model);
}

/** What a suite queues on one agent, named so a helper can take four of them. */
export type StoreScripts = {
	concierge?: (script: ScriptedModel) => void;
	sales?: (script: ScriptedModel) => void;
	warranty?: (script: ScriptedModel) => void;
	billing?: (script: ScriptedModel) => void;
};

/** A silence for an agent this case does not exercise, so the bed still boots. */
function idle(script: ScriptedModel): void {
	script.mockText("nada a dizer");
}

/** The store with a script per agent, which is what a free suite boots. */
export function scriptedStore(scripts: StoreScripts = {}, boot: StoreBoot = {}): AdkTestBedBuilder {
	return storeBed(boot)
		.withScript("concierge", scripts.concierge ?? idle)
		.withScript("sales", scripts.sales ?? idle)
		.withScript("warranty", scripts.warranty ?? idle)
		.withScript("billing", scripts.billing ?? idle);
}
