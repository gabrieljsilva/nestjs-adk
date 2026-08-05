import { describe, expect, it } from "vitest";
import { AppendBarrier } from "./append-barrier";

describe("AppendBarrier", () => {
	it("holds every caller until it is released", async () => {
		const barrier = new AppendBarrier();
		const arrived: string[] = [];

		const first = barrier.wait().then(() => arrived.push("first"));
		const second = barrier.wait().then(() => arrived.push("second"));

		expect(arrived).toEqual([]);
		expect(barrier.waitingCount).toBe(2);

		barrier.release();
		await Promise.all([first, second]);

		expect(arrived).toHaveLength(2);
	});

	it("lets callers through immediately once released", async () => {
		const barrier = new AppendBarrier();
		barrier.release();

		await barrier.wait();

		expect(barrier.waitingCount).toBe(0);
	});

	it("is safe to release twice", async () => {
		const barrier = new AppendBarrier();
		const waiting = barrier.wait();

		barrier.release();
		barrier.release();

		await waiting;
		expect(barrier.waitingCount).toBe(0);
	});
});
