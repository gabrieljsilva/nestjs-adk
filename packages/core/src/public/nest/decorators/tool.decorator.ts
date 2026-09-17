import { Injectable } from "@nestjs/common";
import type { ZodType, z } from "zod";
import { INLINE_TOOLS_METADATA, TOOL_METADATA } from "../../../adapters/nest/metadata/metadata-keys.token";
import type { ToolContext } from "../../../domain/tool/invocation/tool-context.value-object";
import type { AdkTool } from "../tool/adk.tool";

/**
 * What `@Tool` declares. `name` is required on a class and defaults to the method name on an
 * agent method; `effect` is `read`, `write` or `destructive`, and defaults to `write`, which is
 * the answer that asks.
 */
export interface ToolOptions<TSchema extends ZodType = ZodType> {
	name?: string;
	description: string;
	schema: TSchema;
	effect?: string;
}

/** A shared tool is an `AdkTool` over the very schema the decorator was given. */
export type ToolClass<TSchema extends ZodType> = abstract new (...args: never[]) => AdkTool<TSchema>;

export interface ToolMethodDescriptor<TSchema extends ZodType> {
	value?: (input: z.infer<TSchema>, context: ToolContext) => unknown;
}

/** `@Tool` on a class and `@Tool` on a method, both answering to the schema it declared. */
export interface ToolDecorator<TSchema extends ZodType> {
	(target: ToolClass<TSchema>): void;
	(target: object, propertyKey: string | symbol, descriptor: ToolMethodDescriptor<TSchema>): void;
}

function markInjectable(target: object): void {
	const decorate = Injectable();
	decorate(Object(target));
}

/**
 * Declares a tool. On a **class** it is shared by every agent that lists it: the class extends
 * `AdkTool`, becomes a provider, and `execute` is the entry point. On an agent **method** it
 * belongs to that agent alone and the method is the entry point.
 *
 * Either way the schema here is the type of the input, so a method reading a field the model
 * was never asked for does not compile.
 */
export function Tool<TSchema extends ZodType>(options: ToolOptions<TSchema>): ToolDecorator<TSchema> {
	const declare: ToolDecorator<TSchema> = (target: object, propertyKey?: string | symbol): void => {
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
	return declare;
}
