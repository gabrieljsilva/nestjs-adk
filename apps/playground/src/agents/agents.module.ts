import { Module } from "@nestjs/common";
import { AftersalesModule } from "../aftersales/aftersales.module";
import { CatalogModule } from "../catalog/catalog.module";
import { BillingAgent } from "./billing/billing.agent";
import { ConciergeAgent } from "./concierge/concierge.agent";
import { SalesAgent } from "./sales/sales.agent";
import { WarrantyAgent } from "./warranty/warranty.agent";

@Module({
	imports: [CatalogModule, AftersalesModule],
	providers: [ConciergeAgent, SalesAgent, WarrantyAgent, BillingAgent],
	exports: [ConciergeAgent, SalesAgent, WarrantyAgent, BillingAgent],
})
export class AgentsModule {}
