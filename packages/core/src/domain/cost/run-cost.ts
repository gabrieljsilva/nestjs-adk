import type { ModelIdentity } from "../model/model-identity";
import type { ModelCost } from "./model-cost";
import { UsdAmount } from "./usd-amount";

/**
 * What a run cost, in dollars.
 *
 * `total` only ever counts what was actually priced. A model the source does not know about
 * lands in `unpriced` and its tokens stay out of the sum, because a cost that silently reads
 * zero is the one number nobody can act on: it looks like a run that was free instead of a run
 * nobody could price.
 *
 * A run with no pricing source at all answers {@link nothing}, and the reason reaches whoever
 * implemented `PricingNoticeSink`. Nothing about pricing ever fails a run.
 */
export class RunCost {
	private constructor(
		public readonly byModel: readonly ModelCost[],
		public readonly unpriced: readonly ModelIdentity[],
	) {}

	public static of(byModel: readonly ModelCost[], unpriced: readonly ModelIdentity[] = []): RunCost {
		return new RunCost(byModel, unpriced);
	}

	/** No source, or nothing to bill: zero, and not an absence a caller has to check for. */
	public static nothing(unpriced: readonly ModelIdentity[] = []): RunCost {
		return new RunCost([], unpriced);
	}

	public get total(): UsdAmount {
		return this.byModel.reduce((sum, model) => sum.plus(model.amount), UsdAmount.zero());
	}

	public get calls(): number {
		return this.byModel.reduce((count, model) => count + model.calls, 0);
	}

	/** Whether anything at all was left out, which is the one thing a report should not hide. */
	public get isComplete(): boolean {
		return this.unpriced.length === 0;
	}

	/**
	 * What a serialized cost says, which is not the same as what the object holds.
	 *
	 * The total and the completeness are computed, so `JSON.stringify` would drop both and leave
	 * a response that says a run had two models and never says what it cost. The unpriced models
	 * are named rather than counted, because a client that sees an incomplete total needs to know
	 * which model it is missing.
	 */
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
