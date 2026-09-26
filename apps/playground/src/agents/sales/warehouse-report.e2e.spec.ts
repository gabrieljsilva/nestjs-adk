import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import { SessionStorage, SqliteConnection, SqliteSessionStorage } from "@nestjs-adk/core";
import { AdkTestBedBuilder } from "@nestjs-adk/testing";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { StoreDatabase } from "../../shared/store-database";
import { BillingAgent } from "../billing/billing.agent";
import { ConciergeAgent } from "../concierge/concierge.agent";
import { WarrantyAgent } from "../warranty/warranty.agent";
import { SalesAgent } from "./sales.agent";

const ARTIFACT_TOOLS = ["read_artifact", "outline_artifact", "search_artifact", "query_artifact", "slice_artifact"];

/**
 * No provider here, and no threshold override: `get_warehouse_report` answers a document
 * that is over the default offload threshold on its own, so this proves what the runtime
 * does under its own default policy, not under a test-only shortcut.
 */
describe("the store, on a tool result too large to keep in the context", () => {
	it("offloads get_warehouse_report and shows the model a placeholder, not the document", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.mockText("not called"))
			.withScript(SalesAgent, (script) =>
				script.mockToolCall("get_warehouse_report", {}).mockText("The warehouse audit is ready."),
			)
			.withScript(WarrantyAgent, (script) => script.mockText("not called"))
			.withScript(BillingAgent, (script) => script.mockText("not called"))
			.boot();

		const run = await bed.agent(SalesAgent).ask("send me the full warehouse report");

		expect(run).toHaveRunTool("get_warehouse_report");

		const request = bed.script(SalesAgent)?.requests.at(-1);
		if (request === undefined) throw new Error("the sales agent was booted without a script");
		/** The document itself never reaches the prompt: only a sentence naming an artifact. */
		const toolResultText = request.messages.map((message) => message.text).join("\n");

		expect(toolResultText).not.toContain("Warehouse Unit");
		expect(toolResultText).not.toContain("GHOST-PROTOCOL-OMEGA-7X");
		expect(toolResultText).toContain("artifactId");
		expect(toolResultText).toContain("read_artifact(artifactId");
		expect(toolResultText).toContain("its shape is one the artifact exploration tools understand");
	});

	it("offers the sales agent's opted-in exploration tools to the model", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.mockText("not called"))
			.withScript(SalesAgent, (script) => script.mockText("not needed"))
			.withScript(WarrantyAgent, (script) => script.mockText("not called"))
			.withScript(BillingAgent, (script) => script.mockText("not called"))
			.boot();

		await bed.agent(SalesAgent).ask("hello");

		const request = bed.script(SalesAgent)?.requests.at(-1);
		if (request === undefined) throw new Error("the sales agent was booted without a script");
		const offeredNames = request.tools.map((tool) => tool.name);

		expect(offeredNames).toContain("get_warehouse_report");
		for (const toolName of ARTIFACT_TOOLS) expect(offeredNames).toContain(toolName);
	});
});
