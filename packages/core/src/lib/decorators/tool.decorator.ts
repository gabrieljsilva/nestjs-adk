import { Injectable } from "@nestjs/common";
import { INLINE_TOOLS_METADATA, TOOL_METADATA } from "../constants";
import type { AnyZodObject, ToolOptions } from "../types/options";

export interface InlineToolMetadata {
	method: string;
	options: ToolOptions;
}

/**
 * Declares a tool.
 * - On a CLASS (shared): requires `name`; the class must extend AdkTool and becomes an injectable provider.
 * - On an agent METHOD (exclusive): `name` defaults to the method name.
 */
export function Tool<S extends AnyZodObject>(options: ToolOptions<S>) {
	return (target: object, propertyKey?: string | symbol): void => {
		if (propertyKey !== undefined) {
			const ctor = target.constructor;
			const inline: InlineToolMetadata[] = Reflect.getOwnMetadata(INLINE_TOOLS_METADATA, ctor) ?? [];
			inline.push({
				method: String(propertyKey),
				options: { ...options, name: options.name ?? String(propertyKey) },
			});
			Reflect.defineMetadata(INLINE_TOOLS_METADATA, inline, ctor);
			return;
		}

		Reflect.defineMetadata(TOOL_METADATA, options, target);
		Injectable()(target as Parameters<ReturnType<typeof Injectable>>[0]);
	};
}
