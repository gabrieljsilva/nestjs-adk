import type { AnyZodObject } from "@nestjs-adk/core";
import { z } from "zod";

interface JsonSchemaLike {
	type?: string;
	description?: string;
	properties?: Record<string, JsonSchemaLike>;
	required?: string[];
	items?: JsonSchemaLike;
	enum?: unknown[];
}

/** Converte o subset comum de JSON Schema (inputSchema de tools MCP) para Zod. */
export function jsonSchemaToZod(schema: unknown): AnyZodObject {
	const root = (schema ?? {}) as JsonSchemaLike;
	const shape: Record<string, z.ZodType> = {};
	const required = new Set(root.required ?? []);

	for (const [key, property] of Object.entries(root.properties ?? {})) {
		let type = convert(property);
		if (!required.has(key)) type = type.optional();
		shape[key] = type;
	}

	return z.object(shape) as AnyZodObject;
}

function convert(schema: JsonSchemaLike): z.ZodType {
	let type: z.ZodType;

	if (schema.enum) {
		type = z.enum(schema.enum.map(String) as [string, ...string[]]);
	} else {
		switch (schema.type) {
			case "string":
				type = z.string();
				break;
			case "number":
				type = z.number();
				break;
			case "integer":
				type = z.number().int();
				break;
			case "boolean":
				type = z.boolean();
				break;
			case "array":
				type = z.array(schema.items ? convert(schema.items) : z.any());
				break;
			case "object":
				type = jsonSchemaToZod(schema);
				break;
			default:
				type = z.any();
		}
	}

	return schema.description ? type.describe(schema.description) : type;
}
