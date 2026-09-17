import { ParsedArguments } from "../../domain/tool/invocation/parsed-arguments.value-object";
import { ToolSchema } from "../../domain/tool/tool-schema.contract";

const PRIMITIVES: Readonly<Record<string, (value: unknown) => boolean>> = {
	string: (value) => typeof value === "string",
	number: (value) => typeof value === "number",
	integer: (value) => typeof value === "number" && Number.isInteger(value),
	boolean: (value) => typeof value === "boolean",
};

export class JsonSchemaToolSchema extends ToolSchema {
	public constructor(private readonly schema: Readonly<Record<string, unknown>>) {
		super();
	}

	public declaration(): unknown {
		return this.schema;
	}

	public parse(args: unknown): ParsedArguments {
		if (typeof args !== "object" || args === null || Array.isArray(args)) {
			return ParsedArguments.invalid("expected an object of arguments.");
		}

		const declared = this.declaredProperties();
		const pruned: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(args)) {
			if (declared === undefined || declared.has(key)) pruned[key] = value;
		}

		const missing = this.required().filter((name) => pruned[name] === undefined);
		if (missing.length > 0) return ParsedArguments.invalid(`missing required argument(s): ${missing.join(", ")}.`);

		const wrong = this.firstWrongValue(pruned);
		if (wrong !== undefined) return ParsedArguments.invalid(wrong);
		return ParsedArguments.valid(pruned);
	}

	private declaredProperties(): ReadonlySet<string> | undefined {
		const properties = this.propertySchemas();
		return properties === undefined ? undefined : new Set(Object.keys(properties));
	}

	private propertySchemas(): Readonly<Record<string, unknown>> | undefined {
		return this.readRecord(this.schema.properties);
	}

	private readRecord(value: unknown): Record<string, unknown> | undefined {
		if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
		return { ...value };
	}

	private required(): readonly string[] {
		const required = this.schema.required;
		if (!Array.isArray(required)) return [];
		return required.filter((name): name is string => typeof name === "string");
	}

	private firstWrongValue(args: Readonly<Record<string, unknown>>): string | undefined {
		const properties = this.propertySchemas();
		if (properties === undefined) return undefined;
		for (const [name, value] of Object.entries(args)) {
			const declared = this.readRecord(properties[name]);
			if (declared === undefined) continue;
			const reason = this.reasonAgainst(name, value, declared);
			if (reason !== undefined) return reason;
		}
		return undefined;
	}

	private reasonAgainst(name: string, value: unknown, declared: Readonly<Record<string, unknown>>): string | undefined {
		const type = declared.type;
		const satisfies = typeof type === "string" ? PRIMITIVES[type] : undefined;
		if (satisfies !== undefined && !satisfies(value)) return `${name} must be a ${type}.`;
		const allowed = declared.enum;
		if (Array.isArray(allowed) && !allowed.includes(value)) {
			return `${name} must be one of: ${allowed.map((option) => String(option)).join(", ")}.`;
		}
		return undefined;
	}
}
