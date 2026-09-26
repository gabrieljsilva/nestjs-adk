import { AdkTool, Tool } from "@nestjs-adk/core";
import { z } from "zod";

const schema = z.object({});

const RECORD_COUNT = 650;
const CATEGORIES = ["consoles", "accessories", "physical-media", "collectibles", "peripherals"] as const;
const WAREHOUSES = [
	{ name: "north", region: "Manaus", capacity: 12_000 },
	{ name: "south", region: "Curitiba", capacity: 9_500 },
	{ name: "east", region: "Recife", capacity: 7_200 },
	{ name: "west", region: "Cuiabá", capacity: 5_800 },
] as const;

const NEEDLE_INDEX = 337;
const NEEDLE_ALERT = "GHOST-PROTOCOL-OMEGA-7X";

interface WarehouseRecord {
	sku: string;
	title: string;
	warehouse: (typeof WAREHOUSES)[number]["name"];
	category: (typeof CATEGORIES)[number];
	unitsInStock: number;
	unitPriceCents: number;
	lastRestockDay: number;
	serialNumber: string;
	alert?: string;
}

function pick<T>(values: readonly T[], index: number): T {
	const value = values[index % values.length];
	if (value === undefined) throw new Error("unreachable: index modulo length always resolves");
	return value;
}

function buildRecord(index: number): WarehouseRecord {
	const warehouse = pick(WAREHOUSES, index);
	const category = pick(CATEGORIES, index);
	const record: WarehouseRecord = {
		sku: `SKU-${String(index).padStart(4, "0")}`,
		title: `Warehouse Unit ${index}`,
		warehouse: warehouse.name,
		category,
		unitsInStock: (index * 53) % 500,
		unitPriceCents: ((index * 137) % 9_000) + 999,
		lastRestockDay: (index % 28) + 1,
		serialNumber: `SN-${String((index * 9_973) % 1_000_000_000).padStart(9, "0")}`,
	};
	if (index === NEEDLE_INDEX) record.alert = NEEDLE_ALERT;
	return record;
}

function buildReport(): Record<string, unknown> {
	const records = Array.from({ length: RECORD_COUNT }, (_, index) => buildRecord(index));
	const totalUnitsInStock = records.reduce((total, record) => total + record.unitsInStock, 0);
	return {
		summary: {
			totalRecords: records.length,
			totalUnitsInStock,
			warehouseCount: WAREHOUSES.length,
			categories: CATEGORIES,
		},
		warehouses: WAREHOUSES,
		records,
	};
}

@Tool({
	name: "get_warehouse_report",
	description:
		"Returns the full warehouse inventory audit: every SKU across every warehouse, with a summary. " +
		"The document is large; explore it with outline_artifact, search_artifact or query_artifact instead of reading it whole.",
	schema,
	effect: "read",
})
export class WarehouseReportTool extends AdkTool<typeof schema> {
	public execute(): unknown {
		return buildReport();
	}
}
