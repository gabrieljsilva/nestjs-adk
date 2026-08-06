import { Injectable } from "@nestjs/common";
import { RefundService } from "./refund.service";

/** How much a plan may have back without a manager, which is a question on its own. */
@Injectable()
export class RefundLimitUseCase {
	public constructor(private readonly refunds: RefundService) {}

	public execute(plan: string): number {
		return this.refunds.limitCentsFor(plan);
	}
}
