import { IdGenerator } from "@nestjs-adk/core";

/** Real ids, because these suites write to storage a later test may still be reading. */
export class RandomIdGenerator extends IdGenerator {
	public next(): string {
		return crypto.randomUUID();
	}
}
