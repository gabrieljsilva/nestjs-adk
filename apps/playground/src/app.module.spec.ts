import "reflect-metadata";
import { EffectApprovalPolicy, ToolEffect } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { AftersalesController } from "./aftersales/aftersales.controller";
import { BillingAgent } from "./agents/billing.agent";
import { ConciergeAgent } from "./agents/concierge.agent";
import { IssueRefundTool } from "./agents/issue-refund.tool";
import { SalesAgent } from "./agents/sales.agent";
import { WarrantyAgent } from "./agents/warranty.agent";
import { AppModule, storeOptions } from "./app.module";
import { CatalogController } from "./catalog/catalog.controller";
import { ChatController } from "./chat/chat.controller";
import { StoreSeed } from "./shared/store-seed";

/** What `@Module` wrote on the class, which is the only thing this file is about. */
function declared(key: string): readonly unknown[] {
	const metadata: unknown = Reflect.getMetadata(key, AppModule);
	return Array.isArray(metadata) ? metadata : [];
}

describe("AppModule", () => {
	it("declares the four sectors", () => {
		expect(declared("providers")).toEqual(
			expect.arrayContaining([ConciergeAgent, SalesAgent, WarrantyAgent, BillingAgent]),
		);
	});

	it("declares the shared tools as providers of their own", () => {
		expect(declared("providers")).toEqual(expect.arrayContaining([IssueRefundTool]));
	});

	it("fills the store at boot", () => {
		expect(declared("providers")).toEqual(expect.arrayContaining([StoreSeed]));
	});

	it("answers over HTTP as well as in a conversation", () => {
		expect(declared("controllers")).toEqual([ChatController, CatalogController, AftersalesController]);
	});

	it("imports the runtime, and imports it once", () => {
		expect(declared("imports")).toHaveLength(1);
	});

	it("holds money in front of a human, and nothing else", () => {
		expect(storeOptions.runtime?.approvals).toEqual(EffectApprovalPolicy.from(ToolEffect.DESTRUCTIVE));
	});

	it("keeps the conversations in the same database as the store", () => {
		expect(storeOptions.storage).toBeDefined();
	});
});
