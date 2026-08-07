import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { AdkTestBed } from "./adk-test-bed";
import { RunRecorder } from "./run-recorder";

describe("AdkTestBed disposal", () => {
	it("closes its module when the test leaves an await using scope", async () => {
		const module = await Test.createTestingModule({}).compile();
		const close = vi.spyOn(module, "close");

		{
			await using bed = new AdkTestBed(module, new RunRecorder(), new Map(), new Map());
			expect(bed.module).toBe(module);
		}

		expect(close).toHaveBeenCalledOnce();
	});
});
