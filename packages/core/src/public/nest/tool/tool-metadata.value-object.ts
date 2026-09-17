import type { ZodType } from "zod";
import { TOOL_METADATA } from "../../../adapters/nest/metadata/metadata-keys.token";
import { NotAToolClassError } from "../errors/not-a-tool-class.error";

/**
 * What `@Tool` wrote on a class, read back without a container: the name the model calls, the
 * description it reads, the schema that parses the input and the declared effect.
 *
 * It is how a double stands in for a tool while inheriting its declaration. `findOrFail`
 * raises `NotAToolClassError` for a class the decorator never touched.
 */
export class ToolMetadata {
	private constructor(
		public readonly name: string,
		public readonly description: string,
		public readonly schema: ZodType,
		public readonly effect?: string,
	) {}

	public static find(type: unknown): ToolMetadata | undefined {
		if (typeof type !== "function") return undefined;
		const metadata: unknown = Reflect.getMetadata(TOOL_METADATA, type);
		if (typeof metadata !== "object" || metadata === null) return undefined;
		const name = Reflect.get(metadata, "name");
		const description = Reflect.get(metadata, "description");
		const schema = Reflect.get(metadata, "schema");
		const effect = Reflect.get(metadata, "effect");
		if (typeof name !== "string" || typeof description !== "string") return undefined;
		if (!ToolMetadata.isSchema(schema)) return undefined;
		return new ToolMetadata(name, description, schema, typeof effect === "string" ? effect : undefined);
	}

	public static findOrFail(type: unknown): ToolMetadata {
		const declaration = ToolMetadata.find(type);
		if (declaration === undefined) throw new NotAToolClassError(ToolMetadata.candidateName(type));
		return declaration;
	}

	private static isSchema(value: unknown): value is ZodType {
		return typeof value === "object" && value !== null && typeof Reflect.get(value, "safeParse") === "function";
	}

	private static candidateName(type: unknown): string {
		const name = typeof type === "function" ? Reflect.get(type, "name") : undefined;
		return typeof name === "string" && name.length > 0 ? name : String(type);
	}
}
