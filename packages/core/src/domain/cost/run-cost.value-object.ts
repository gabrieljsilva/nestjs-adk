import type { ModelIdentity } from "../model/descriptor/model-identity.value-object";
import type { ModelCost } from "./model-cost.value-object";
import { UsdAmount } from "./usd-amount.value-object";

/**
 * What a run cost, in dollars.
 *
 * `total` only ever counts what was actually priced. A model that could not be priced lands in
 * `unpriced`, its tokens stay out of the sum and `isComplete` answers false, so a zero total is
 * never read as a free run. Nothing about pricing ever fails a run.
 */
export class RunCost {
	public constructor(
		public readonly byModel: readonly ModelCost[],
		public readonly unpriced: readonly ModelIdentity[] = [],
	) {}

	public static nothing(unpriced: readonly ModelIdentity[] = []): RunCost {
		return new RunCost([], unpriced);
	}

	public get total(): UsdAmount {
		return this.byModel.reduce((sum, model) => sum.plus(model.amount), UsdAmount.zero());
	}

	public get calls(): number {
		return this.byModel.reduce((count, model) => count + model.calls, 0);
	}

	public get isComplete(): boolean {
		return this.unpriced.length === 0;
	}

	public toJSON(): {
		total: string;
		calls: number;
		isComplete: boolean;
		byModel: readonly ModelCost[];
		unpriced: readonly string[];
	} {
		return {
			total: this.total.toString(),
			calls: this.calls,
			isComplete: this.isComplete,
			byModel: this.byModel,
			unpriced: this.unpriced.map((model) => model.toString()),
		};
	}
}
