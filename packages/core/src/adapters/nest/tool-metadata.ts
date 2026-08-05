import type { ZodType } from "zod";
import { ToolEffect } from "../../domain/tool/tool-effect";
import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";

/**
 * The `@Tool` payload, validated on the way in.
 *
 * The effect defaults to `write` rather than `read`, and that asymmetry is the point: the
 * author had the chance to say a tool changes nothing and did not say it, so the runtime
 * assumes the answer that costs an approval rather than the one that skips it.
 */
export class ToolMetadata {
	private constructor(
		public readonly name: string,
		public readonly description: string,
		public readonly schema: ZodType,
		public readonly effect: ToolEffect,
	) {}

	public static from(value: unknown, providerName: string, fallbackName?: string): ToolMetadata {
		if (typeof value !== "object" || value === null) {
			throw new InvalidAgentMetadataError(providerName, "@Tool metadata is not an object.");
		}
		const name = Reflect.get(value, "name") ?? fallbackName;
		const description = Reflect.get(value, "description");
		const schema = Reflect.get(value, "schema");
		if (typeof name !== "string") throw new InvalidAgentMetadataError(providerName, "@Tool needs a name.");
		if (typeof description !== "string") {
			throw new InvalidAgentMetadataError(providerName, `@Tool ${name} needs a description.`);
		}
		if (typeof schema !== "object" || schema === null) {
			throw new InvalidAgentMetadataError(providerName, `@Tool ${name} needs a zod schema.`);
		}
		return new ToolMetadata(name, description, schema, ToolMetadata.effectOf(value, name, providerName));
	}

	private static effectOf(value: object, name: string, providerName: string): ToolEffect {
		const declared = Reflect.get(value, "effect");
		if (declared === undefined) return ToolEffect.WRITE;
		if (typeof declared !== "string") {
			throw new InvalidAgentMetadataError(providerName, `@Tool ${name} declared an effect that is not a name.`);
		}
		const effect = ToolEffect.of(declared);
		if (effect === undefined) {
			throw new InvalidAgentMetadataError(providerName, `@Tool ${name} declared an unknown effect "${declared}".`);
		}
		return effect;
	}
}
