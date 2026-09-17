import { strict as assert } from "node:assert";
import type { Clock } from "../../common/time/clock.contract";
import { ContractCase } from "./contract-case.support";
import { ContractSuite } from "./contract-suite.support";

export class ClockContractSuite extends ContractSuite<Clock> {
	public readonly port = "Clock";

	public cases(create: () => Clock): ContractCase[] {
		return [
			new ContractCase("answers with an instant", () => {
				const now = create().now();
				assert.equal(typeof now.toIso(), "string");
			}),
			new ContractCase("does not move between two consecutive reads", () => {
				const clock = create();
				assert.ok(clock.now().equals(clock.now()));
			}),
			new ContractCase("never reports a time earlier than a previous read", () => {
				const clock = create();
				const first = clock.now();
				assert.ok(!clock.now().isBefore(first));
			}),
		];
	}
}
