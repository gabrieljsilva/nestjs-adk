import { createHash } from "node:crypto";
import { McpInvalidSourceNameError } from "./errors/mcp-invalid-source-name.error";

const PREFIX = "mcp";
const USABLE = /^[A-Za-z0-9_-]+$/;
const LIMIT = 64;
const DIGEST = 8;
const JOIN = "__";
const SOURCE_LIMIT = LIMIT - PREFIX.length - JOIN.length * 2 - 1 - (DIGEST + 1);

export class McpToolName {
	private constructor(public readonly source: string) {}

	public static forSource(source: string): McpToolName {
		if (source.length === 0) throw new McpInvalidSourceNameError(source, "it is empty");
		if (!USABLE.test(source)) {
			throw new McpInvalidSourceNameError(source, "only letters, digits, `_` and `-` are allowed");
		}
		if (source.length > SOURCE_LIMIT) {
			throw new McpInvalidSourceNameError(source, `it is longer than ${SOURCE_LIMIT} characters`);
		}
		return new McpToolName(source);
	}

	public static isUsable(tool: string): boolean {
		return USABLE.test(tool) && tool.length <= LIMIT;
	}

	public qualify(tool: string): string {
		const full = `${PREFIX}${JOIN}${this.source}${JOIN}${tool}`;
		if (full.length <= LIMIT) return full;
		const digest = createHash("sha256").update(full).digest("hex").slice(0, DIGEST);
		return `${full.slice(0, LIMIT - DIGEST - 1)}_${digest}`;
	}
}
