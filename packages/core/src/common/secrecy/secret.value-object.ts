const MASK = "[redacted]";

// Node's inspect hook, taken by name so this file does not import `node:util`.
const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/**
 * A value that must not appear in a log, an event or an error message.
 *
 * Interpolation, `JSON.stringify` and `console.log` all answer `[redacted]`, and the value is
 * a private field, so it does not survive a spread. Reading it takes calling {@link reveal}.
 */
export class Secret {
	readonly #value: string;

	public constructor(value: string) {
		this.#value = value;
	}

	public static fromOption(value: Secret | string | undefined): Secret | undefined {
		if (value === undefined) return undefined;
		return value instanceof Secret ? value : new Secret(value);
	}

	public reveal(): string {
		return this.#value;
	}

	public get isEmpty(): boolean {
		return this.#value.length === 0;
	}

	public equals(other: Secret): boolean {
		return this.#value === other.#value;
	}

	public toString(): string {
		return MASK;
	}

	public toJSON(): string {
		return MASK;
	}

	public [INSPECT](): string {
		return MASK;
	}
}
