import { IdGenerator } from "../common/identity/id-generator";
import { IdSequenceExhaustedError } from "./errors/id-sequence-exhausted.error";

const DEFAULT_PREFIX = "id";
const DEFAULT_LIMIT = 1000;

/**
 * Generator that walks a predictable sequence instead of producing random ids.
 * It never repeats a value and refuses to keep going once the limit is reached,
 * so an exhausted sequence surfaces as a failure rather than as flaky output.
 */
export class SequenceIdGenerator extends IdGenerator {
	private cursor = 0;

	public constructor(
		private readonly prefix: string = DEFAULT_PREFIX,
		private readonly limit: number = DEFAULT_LIMIT,
	) {
		super();
	}

	public next(): string {
		if (this.cursor >= this.limit) throw new IdSequenceExhaustedError(this.limit);
		this.cursor += 1;
		return `${this.prefix}-${this.cursor}`;
	}
}
