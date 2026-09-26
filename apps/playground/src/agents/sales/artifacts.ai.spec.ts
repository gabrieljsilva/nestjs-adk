import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import {
	ArtifactContent,
	ArtifactName,
	ArtifactStorage,
	CharacterCountOffloadPolicy,
	SessionContext,
	SessionStorage,
	SqliteConnection,
	SqliteSessionStorage,
} from "@nestjs-adk/core";
import { AdkTestBedBuilder, RunTranscript } from "@nestjs-adk/testing";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { StoreDatabase } from "../../shared/store-database";
import { openAILuna } from "../../testing/models";
import { SalesAgent } from "./sales.agent";

const ARTIFACT_TOOLS = ["read_artifact", "outline_artifact", "search_artifact", "query_artifact", "slice_artifact"];

const EXPLORATION_TOOLS = ["list_artifacts", ...ARTIFACT_TOOLS];

const SHIFT_NOTES_NAME = "shift-notes.txt";

const SHIFT_NOTES = [
	"Nebula Games shift notes",
	"Opening hours: the store opens at 09:00 and closes at 18:00.",
	"Staff on duty today: Ana, Bruno and Clara.",
	"Total staff on duty: 4.",
	"Delivery partner: Correios, collected every weekday at 17:00.",
].join("\n");

function buildInventory(): string {
	const rows = ["sku,title,warehouse,units"];
	for (let at = 1; at <= 400; at += 1) {
		rows.push(
			`SKU-${String(at).padStart(4, "0")},Filler Game ${at},${at % 2 === 0 ? "north" : "south"},${(at * 7) % 50}`,
		);
	}
	rows.push("SKU-9999,Celeste Farewell Edition,east,731");
	return rows.join("\n");
}

describe("AI: artifacts, a file attached and a result too large to keep", () => {
	it(
		"reads a CSV the customer attached through the artifact tools, not from the prompt",
		{ timeout: 180_000 },
		async () => {
			const connection = new SqliteConnection();
			await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
				.overriding(StoreDatabase, new StoreDatabase(connection))
				.overriding(SessionStorage, new SqliteSessionStorage(connection))
				.withModel(openAILuna)
				.withConsumers(new RunTranscript())
				.boot();

			const run = await bed
				.agent(SalesAgent)
				.ask(
					"I attached our inventory export. How many units of Celeste Farewell Edition do we hold, and in which warehouse?",
					{
						files: [ArtifactContent.fromText(buildInventory(), "text/csv", ArtifactName.fromText("inventory.csv"))],
					},
				);

			expect(run.toolsRun.some((tool) => ARTIFACT_TOOLS.includes(tool))).toBe(true);
			expect(run.text).toContain("731");
			expect(run.text.toLowerCase()).toContain("east");
			expect(run).toHaveStatus("completed");
		},
	);

	it(
		"answers from a tool result the runtime offloaded, by exploring the artifact it became",
		{ timeout: 180_000 },
		async () => {
			const connection = new SqliteConnection();
			await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
				.overriding(StoreDatabase, new StoreDatabase(connection))
				.overriding(SessionStorage, new SqliteSessionStorage(connection))
				.withModel(openAILuna)
				.withConsumers(new RunTranscript())
				.withRuntime({ context: { offload: CharacterCountOffloadPolicy.above(300) } })
				.boot();

			const run = await bed
				.agent(SalesAgent)
				.ask("List the whole store with search_games using an empty term, then tell me the exact slug of Stardew Valley.");

			expect(run).toHaveRunTool("search_games");
			expect(run.toolsRun.some((tool) => ARTIFACT_TOOLS.includes(tool))).toBe(true);
			expect(run.text).toContain("stardew");
			expect(run).toHaveStatus("completed");
		},
	);

	it("finds the one alerted SKU in a warehouse report the prompt could never hold", { timeout: 240_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed
			.agent(SalesAgent)
			.ask(
				"Call get_warehouse_report. Exactly one record in it carries an alert field. Tell me the sku of that record and the exact alert value, copied character for character.",
			);

		expect(run).toHaveRunTool("get_warehouse_report");
		expect(run.toolsRun.some((tool) => EXPLORATION_TOOLS.includes(tool))).toBe(true);
		expect(run.text).toContain("GHOST-PROTOCOL-OMEGA-7X");
		expect(run).toHaveStatus("completed");
	});

	it(
		"corrects a line of an attached file with edit_artifact, and the store holds the correction",
		{ timeout: 240_000 },
		async () => {
			const connection = new SqliteConnection();
			await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
				.overriding(StoreDatabase, new StoreDatabase(connection))
				.overriding(SessionStorage, new SqliteSessionStorage(connection))
				.withModel(openAILuna)
				.withConsumers(new RunTranscript())
				.boot();

			const run = await bed
				.agent(SalesAgent)
				.ask(
					"I attached today's shift notes. The line giving the total number of staff on duty is wrong: only Ana, Bruno and Clara are on duty, so that total has to be 3. Read the file and use edit_artifact to correct that one line in the file itself, leaving every other line as it is.",
					{
						files: [ArtifactContent.fromText(SHIFT_NOTES, "text/plain", ArtifactName.fromText(SHIFT_NOTES_NAME))],
					},
				);

			expect(run).toHaveRunTool("edit_artifact");
			expect(run).toHaveStatus("completed");

			const artifacts = bed.get(ArtifactStorage);
			const session = SessionContext.fromSessionId(run.sessionId);
			const reference = (await artifacts.list(session, 10)).find((each) => each.name?.value === SHIFT_NOTES_NAME);
			if (reference === undefined) throw new Error("the attached shift notes are not in the artifact store");
			const stored = (await artifacts.read(session, reference)).text;

			expect(stored).toContain("Total staff on duty: 3");
			expect(stored).not.toContain("Total staff on duty: 4");
			expect(stored).toContain("Staff on duty today: Ana, Bruno and Clara.");
		},
	);
});
