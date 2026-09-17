import { type ZodType, toJSONSchema } from "zod";
import { ParsedArguments } from "../../domain/tool/invocation/parsed-arguments.value-object";
import { ToolSchema } from "../../domain/tool/tool-schema.contract";

const CONVERSION: Parameters<typeof toJSONSchema>[1] = {
	io: "input",
	target: "draft-7",
	reused: "inline",
	unrepresentable: "any",
};

const DIALECT_FIELD = "$schema";

/**
 * Validates the arguments of a tool declared with zod, and derives the declaration the model
 * reads from that same schema, so the two cannot drift.
 *
 * Arguments a model wrote badly are ordinary traffic: they come back as invalid arguments the
 * model can correct, never as a thrown error. The tool receives what zod produced, with
 * defaults, coercion and transforms applied. `withDeclaration` takes a hand written declaration
 * instead, and whoever passes one owns keeping it in agreement with the schema.
 */
export class ZodToolSchema extends ToolSchema {
	private constructor(
		private readonly schema: ZodType,
		private readonly jsonSchema: unknown,
	) {
		super();
	}

	public static fromSchema(schema: ZodType): ZodToolSchema {
		return new ZodToolSchema(schema, ZodToolSchema.buildDeclaration(schema));
	}

	public static withDeclaration(schema: ZodType, jsonSchema: unknown): ZodToolSchema {
		return new ZodToolSchema(schema, jsonSchema);
	}

	public declaration(): unknown {
		return this.jsonSchema;
	}

	public parse(args: unknown): ParsedArguments {
		const result = this.schema.safeParse(args);
		if (!result.success) return ParsedArguments.invalid(this.readReason(result.error));
		const values: unknown = result.data;
		if (typeof values !== "object" || values === null || Array.isArray(values)) {
			return ParsedArguments.invalid("expected an object of arguments.");
		}
		return ParsedArguments.valid({ ...values });
	}

	private static buildDeclaration(schema: ZodType): Record<string, unknown> {
		const { [DIALECT_FIELD]: _dialect, ...declaration } = toJSONSchema(schema, CONVERSION);
		return declaration;
	}

	private readReason(error: unknown): string {
		if (error instanceof Error) return error.message;
		return typeof error === "string" ? error : "the arguments do not match the schema.";
	}
}
