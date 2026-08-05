/** What anything that prints a secret prints instead. */
const MASK = "[redacted]";

/**
 * How Node asks an object what it looks like in a log.
 * Taken by name rather than by importing `node:util`, which keeps this usable anywhere
 * and still answers the tool that most often prints a secret by accident.
 */
const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/**
 * A value that must not appear in a log, an event or an error message.
 *
 * It hides itself rather than trusting every caller to remember. String interpolation and
 * a thrown error reach `toString`, `JSON.stringify` reaches `toJSON`, and `console.log`
 * reaches the inspect hook: all three answer the mask. The value itself is a private
 * field, so it is not enumerable, does not survive a spread and is not there to be found
 * by anything that walks an object. Reading it takes calling `reveal`, which is a word
 * that shows up in a review.
 *
 * The type is the point. Redaction by field name only catches the names it knows, so a
 * credential wrapped here stays hidden under any name at all.
 */
export class Secret {
	readonly #value: string;

	private constructor(value: string) {
		this.#value = value;
	}

	public static of(value: string): Secret {
		return new Secret(value);
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
