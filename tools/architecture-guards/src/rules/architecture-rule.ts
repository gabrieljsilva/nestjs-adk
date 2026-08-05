import type { SourceFile } from "../source-file";
import type { SourceIndex } from "../source-index";
import type { Violation } from "../violation";

/**
 * One architectural constraint, checked file by file.
 * The name is the key the allowlist uses, so renaming a rule invalidates its entries
 * on purpose instead of silently carrying them over.
 */
export abstract class ArchitectureRule {
	public abstract readonly name: string;

	public abstract check(file: SourceFile, index: SourceIndex): Violation[];
}
