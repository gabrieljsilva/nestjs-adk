import { CharacterCountOffloadPolicy } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { WarehouseReportTool } from "./warehouse-report.tool";

describe("WarehouseReportTool", () => {
	it("answers valid JSON", () => {
		const tool = new WarehouseReportTool();

		expect(() => JSON.stringify(tool.execute())).not.toThrow();
		expect(() => JSON.parse(JSON.stringify(tool.execute()))).not.toThrow();
	});

	it("is comfortably over the default offload threshold", () => {
		const tool = new WarehouseReportTool();
		const json = JSON.stringify(tool.execute());

		expect(json.length).toBeGreaterThan(CharacterCountOffloadPolicy.DEFAULT_THRESHOLD);
	});

	it("plants exactly one findable needle, at a fixed pointer", () => {
		const tool = new WarehouseReportTool();
		const report = tool.execute() as { records: ReadonlyArray<Record<string, unknown>> };
		const json = JSON.stringify(report);

		const occurrences = json.split("GHOST-PROTOCOL-OMEGA-7X").length - 1;
		expect(occurrences).toBe(1);
		expect(report.records[337]?.alert).toBe("GHOST-PROTOCOL-OMEGA-7X");
		expect(report.records.filter((record) => record.alert !== undefined)).toHaveLength(1);
	});

	it("is deterministic: two calls answer byte identical documents", () => {
		const tool = new WarehouseReportTool();

		expect(JSON.stringify(tool.execute())).toBe(JSON.stringify(tool.execute()));
	});
});
