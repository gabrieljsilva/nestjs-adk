import ts from "typescript";
import type { SourceFile } from "../source-file";
import type { SourceIndex } from "../source-index";
import { Violation } from "../violation";
import { ArchitectureRule } from "./architecture-rule";

/** Escape hatches that defeat the type system, reported wherever they appear. */
export class ForbiddenSyntaxRule extends ArchitectureRule {
	public readonly name = "forbidden-syntax";

	public check(file: SourceFile, _index: SourceIndex): Violation[] {
		const violations: Violation[] = [];
		this.collect(
			file,
			ts.SyntaxKind.AnyKeyword,
			"`any` erases the contract; type the value or accept `unknown`.",
			violations,
		);
		this.collect(
			file,
			ts.SyntaxKind.AsExpression,
			"`as` asserts instead of proving; validate and return an instance.",
			violations,
		);
		this.collect(file, ts.SyntaxKind.NonNullExpression, "`!` hides an absent value; handle it or narrow it.", violations);
		return violations;
	}

	private collect(file: SourceFile, kind: ts.SyntaxKind, message: string, into: Violation[]): void {
		for (const line of file.linesOfSyntax(kind)) {
			into.push(new Violation(file.path, this.name, line, message));
		}
	}
}
