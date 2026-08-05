import { Injectable } from "@nestjs/common";
import type { ZodType } from "zod";
import { INLINE_TOOLS_METADATA, TOOL_METADATA } from "../../../adapters/nest/metadata-keys";

/** What `@Tool` declares. The effect defaults to `write`, which is the answer that asks. */
export interface ToolOptions {
	/** Required on a class; on an agent method it defaults to the method name. */
	name?: string;
	description: string;
	schema: ZodType;
	/** `read`, `write` or `destructive`. */
	effect?: string;
}

/** Nest's own decorator takes a constructor; a decorated class is the same thing. */
function markInjectable(target: object): void {
	const decorate = Injectable();
	decorate(Object(target));
}

/**
 * Declares a tool.
 *
 * On a **class** it is a tool shared by every agent that lists it, and the class becomes a
 * provider with `execute` as the entry point. On an agent **method** it belongs to that
 * agent alone, and the method is the entry point.
 */
export function Tool(options: ToolOptions) {
	return (target: object, propertyKey?: string | symbol): void => {
		if (propertyKey !== undefined) {
			const owner = target.constructor;
			const declared: unknown[] = Reflect.getOwnMetadata(INLINE_TOOLS_METADATA, owner) ?? [];
			declared.push({ method: String(propertyKey), options: { ...options, name: options.name ?? String(propertyKey) } });
			Reflect.defineMetadata(INLINE_TOOLS_METADATA, declared, owner);
			return;
		}
		Reflect.defineMetadata(TOOL_METADATA, options, target);
		markInjectable(target);
	};
}
