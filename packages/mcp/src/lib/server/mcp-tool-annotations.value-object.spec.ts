import { ToolEffect } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { McpToolAnnotations } from "./mcp-tool-annotations.value-object";

describe("McpToolAnnotations", () => {
	it("marks a read as read-only and not destructive", () => {
		expect(McpToolAnnotations.of(ToolEffect.READ).toJSON()).toEqual({ readOnlyHint: true, destructiveHint: false });
	});

	it("marks a write as neither, which is what the author said", () => {
		expect(McpToolAnnotations.of(ToolEffect.WRITE).toJSON()).toEqual({ readOnlyHint: false, destructiveHint: false });
	});

	it("marks a destructive tool so a careful client asks first", () => {
		expect(McpToolAnnotations.of(ToolEffect.DESTRUCTIVE).toJSON()).toEqual({
			readOnlyHint: false,
			destructiveHint: true,
		});
	});
});
