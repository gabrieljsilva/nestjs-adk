import { randomUUID } from "node:crypto";
import { IdGenerator } from "./id-generator.contract";

/** The default generator: a random UUID per id, which is what a journal needs. */
export class RandomIdGenerator extends IdGenerator {
	public next(): string {
		return randomUUID();
	}
}
