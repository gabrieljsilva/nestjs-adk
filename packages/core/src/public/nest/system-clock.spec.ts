import { describe, expect, it } from "vitest";
import { SystemClock } from "./system-clock";

describe("SystemClock", () => {
	it("answers with a time that moves", async () => {
		const clock = new SystemClock();

		const first = clock.now();
		await new Promise((resolve) => setTimeout(resolve, 2));
		const second = clock.now();

		expect(second.isBefore(first)).toBe(false);
	});
});
