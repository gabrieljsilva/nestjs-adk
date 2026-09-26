import { Injectable } from "@nestjs/common";
import { RefundService } from "./refund.service";

@Injectable()
export class RefundLimitUseCase {
	public constructor(private readonly refunds: RefundService) {}

	public execute(plan: string): number {
		return this.refunds.limitCentsFor(plan);
	}
}
