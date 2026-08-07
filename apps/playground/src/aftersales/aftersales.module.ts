import { Module } from "@nestjs/common";
import { SharedModule } from "../shared/shared.module";
import { AftersalesController } from "./aftersales.controller";
import { FindOrderUseCase } from "./find-order.use-case";
import { IssueRefundUseCase } from "./issue-refund.use-case";
import { OpenTicketUseCase } from "./open-ticket.use-case";
import { OrderRepository } from "./order.repository";
import { OrderService } from "./order.service";
import { RefundLimitUseCase } from "./refund-limit.use-case";
import { RefundPolicy } from "./refund-policy";
import { RefundService } from "./refund.service";
import { TicketRepository } from "./ticket.repository";
import { TicketService } from "./ticket.service";
import { IssueRefundTool } from "./tools/issue-refund.tool";

@Module({
	imports: [SharedModule],
	controllers: [AftersalesController],
	providers: [
		OrderRepository,
		TicketRepository,
		OrderService,
		TicketService,
		RefundPolicy,
		RefundService,
		FindOrderUseCase,
		OpenTicketUseCase,
		RefundLimitUseCase,
		IssueRefundUseCase,
		IssueRefundTool,
	],
	exports: [OrderRepository, TicketRepository, FindOrderUseCase, OpenTicketUseCase, RefundLimitUseCase, IssueRefundTool],
})
export class AftersalesModule {}
