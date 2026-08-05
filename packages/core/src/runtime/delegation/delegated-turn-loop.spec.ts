import { describe, expect, it } from "vitest";
import { DelegatedTurnLoop } from "./delegated-turn-loop";

describe("DelegatedTurnLoop", () => {
	it("is the half of the loop a delegation is allowed to reach", () => {
		class OneTurnLoop extends DelegatedTurnLoop {
			public ran = 0;

			public async run(): Promise<void> {
				this.ran += 1;
			}
		}
		const loop = new OneTurnLoop();

		expect(loop).toBeInstanceOf(DelegatedTurnLoop);
	});
});
