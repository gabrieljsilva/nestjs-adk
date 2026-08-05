import { type ZodType, toJSONSchema } from "zod";
import { ParsedArguments } from "../../domain/tool/parsed-arguments";
import { ToolSchema } from "../../domain/tool/tool-schema";

/**
 * How a tool schema is converted, and why each option is what it is.
 *
 * `io: "input"` describes what the model has to send rather than what the tool receives,
 * so a field with a default is not demanded from a model that never needs to write it.
 * `draft-7` is the dialect providers actually accept. `reused: "inline"` keeps `$ref` and
 * `$defs` out, which several of them reject outright. `unrepresentable: "any"` degrades a
 * type with no JSON Schema equivalent instead of refusing to describe the tool at all.
 */
const CONVERSION: Parameters<typeof toJSONSchema>[1] = {
	io: "input",
	target: "draft-7",
	reused: "inline",
	unrepresentable: "any",
};

/** Says what dialect the document is written in, which is about the document and not about the arguments. */
const DIALECT_FIELD = "$schema";

/**
 * Validates the arguments of a tool declared with zod, and describes it to the model.
 *
 * `safeParse` and never `parse`: arguments a model wrote badly are ordinary traffic, and
 * a thrown validation error here would turn a retriable mistake into a failed run. What
 * comes back is what zod produced, so a schema with defaults, coercion or transforms
 * hands the tool the shape it declared rather than the shape the model sent.
 *
 * The declaration is derived from the same schema, so the two cannot drift. Written by
 * hand they are two descriptions of one shape with nothing tying them together, and the
 * one the model reads is the one nobody validates against.
 *
 * It lives in adapters because zod is a foreign library being fitted to a contract of
 * this domain. Nothing in the runtime knows it exists.
 */
export class ZodToolSchema extends ToolSchema {
	private constructor(
		private readonly schema: ZodType,
		private readonly jsonSchema: unknown,
	) {
		super();
	}

	/** The declaration comes from the schema, which is what keeps one shape describing itself. */
	public static of(schema: ZodType): ZodToolSchema {
		return new ZodToolSchema(schema, ZodToolSchema.declarationOf(schema));
	}

	/**
	 * The same validation, with a declaration the caller wrote.
	 * It exists for a provider that wants something the conversion does not produce, and
	 * whoever uses it owns keeping the two in agreement.
	 */
	public static withDeclaration(schema: ZodType, jsonSchema: unknown): ZodToolSchema {
		return new ZodToolSchema(schema, jsonSchema);
	}

	public declaration(): unknown {
		return this.jsonSchema;
	}

	public parse(args: unknown): ParsedArguments {
		const result = this.schema.safeParse(args);
		if (!result.success) return ParsedArguments.invalid(this.reasonOf(result.error));
		const values: unknown = result.data;
		if (typeof values !== "object" || values === null || Array.isArray(values)) {
			return ParsedArguments.invalid("expected an object of arguments.");
		}
		return ParsedArguments.valid({ ...values });
	}

	private static declarationOf(schema: ZodType): Record<string, unknown> {
		const { [DIALECT_FIELD]: _dialect, ...declaration } = toJSONSchema(schema, CONVERSION);
		return declaration;
	}

	/** Whatever zod reported, as one line the model can act on. */
	private reasonOf(error: unknown): string {
		if (error instanceof Error) return error.message;
		return typeof error === "string" ? error : "the arguments do not match the schema.";
	}
}
