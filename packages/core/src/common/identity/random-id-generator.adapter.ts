import { randomUUID } from "node:crypto";
import { IdGenerator } from "./id-generator.contract";

/**
 * Ids nothing can collide with, which is what a journal needs.
 * Sequential ids belong to tests, where being able to predict them is the point.
 */
export class RandomIdGenerator extends IdGenerator {
	public next(): string {
		return randomUUID();
	}
}
