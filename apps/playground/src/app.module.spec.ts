import "reflect-metadata";
import { EffectApprovalPolicy, ToolEffect } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { AftersalesModule } from "./aftersales/aftersales.module";
import { IssueRefundTool } from "./aftersales/tools/issue-refund.tool";
import { AgentsModule } from "./agents/agents.module";
import { BillingAgent } from "./agents/billing/billing.agent";
import { ConciergeAgent } from "./agents/concierge/concierge.agent";
import { SalesAgent } from "./agents/sales/sales.agent";
import { WarrantyAgent } from "./agents/warranty/warranty.agent";
import { AppModule, storeOptions } from "./app.module";
import { CatalogModule } from "./catalog/catalog.module";
import { QuoteGameTool } from "./catalog/tools/quote-game.tool";
import { SearchGamesTool } from "./catalog/tools/search-games.tool";
import { ChatController } from "./chat/chat.controller";
import { SharedModule } from "./shared/shared.module";
import { StoreSeed } from "./shared/store-seed";

describe("AppModule", () => {
	it("declares the four sectors", () => {
		expect(
			Array.isArray(Reflect.getMetadata("providers", AgentsModule)) ? Reflect.getMetadata("providers", AgentsModule) : [],
		).toEqual(expect.arrayContaining([ConciergeAgent, SalesAgent, WarrantyAgent, BillingAgent]));
	});

	it("declares the shared tools as providers of their own", () => {
		expect(
			Array.isArray(Reflect.getMetadata("exports", CatalogModule)) ? Reflect.getMetadata("exports", CatalogModule) : [],
		).toEqual(expect.arrayContaining([SearchGamesTool, QuoteGameTool]));
		expect(
			Array.isArray(Reflect.getMetadata("exports", AftersalesModule))
				? Reflect.getMetadata("exports", AftersalesModule)
				: [],
		).toEqual(expect.arrayContaining([IssueRefundTool]));
	});

	it("fills the store at boot", () => {
		expect(
			Array.isArray(Reflect.getMetadata("providers", AppModule)) ? Reflect.getMetadata("providers", AppModule) : [],
		).toEqual(expect.arrayContaining([StoreSeed]));
	});

	it("answers over HTTP as well as in a conversation", () => {
		expect(
			Array.isArray(Reflect.getMetadata("controllers", AppModule)) ? Reflect.getMetadata("controllers", AppModule) : [],
		).toEqual([ChatController]);
		expect(
			Array.isArray(Reflect.getMetadata("imports", AppModule)) ? Reflect.getMetadata("imports", AppModule) : [],
		).toEqual(expect.arrayContaining([SharedModule, CatalogModule, AftersalesModule, AgentsModule]));
	});

	it("imports the runtime, and imports it once", () => {
		expect(
			Array.isArray(Reflect.getMetadata("imports", AppModule)) ? Reflect.getMetadata("imports", AppModule) : [],
		).toHaveLength(5);
	});

	it("holds money in front of a human, and nothing else", () => {
		expect(storeOptions.runtime?.approvals).toEqual(EffectApprovalPolicy.from(ToolEffect.DESTRUCTIVE));
	});

	it("keeps the conversations in the same database as the store", () => {
		expect(storeOptions.storage).toBeDefined();
	});
});
