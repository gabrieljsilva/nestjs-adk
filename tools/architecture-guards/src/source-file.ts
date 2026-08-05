import ts from "typescript";
import { ImportRef } from "./import-ref";
import type { SourcePath } from "./source-path";
import { SourceSymbol } from "./source-symbol";

/**
 * A scanned file with its syntax tree.
 * Parsing beats matching text: `as`, `!` and `any` are read as nodes, so a rule never
 * fires on a comment or on a string that merely looks like the syntax it forbids.
 */
export class SourceFile {
	private constructor(
		public readonly path: SourcePath,
		private readonly ast: ts.SourceFile,
	) {}

	public static parse(path: SourcePath, text: string): SourceFile {
		return new SourceFile(path, ts.createSourceFile(path.value, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS));
	}

	public imports(): ImportRef[] {
		const found: ImportRef[] = [];
		for (const statement of this.ast.statements) {
			const specifier = SourceFile.moduleSpecifierOf(statement);
			if (specifier === undefined) continue;
			found.push(new ImportRef(specifier.text, this.lineOf(specifier.getStart(this.ast))));
		}
		return found;
	}

	public exportedClasses(): SourceSymbol[] {
		const found: SourceSymbol[] = [];
		for (const statement of this.ast.statements) {
			if (!ts.isClassDeclaration(statement)) continue;
			if (!SourceFile.isExported(statement)) continue;
			const name = statement.name?.text ?? "(anonymous)";
			found.push(new SourceSymbol(name, this.lineOf(statement.getStart(this.ast))));
		}
		return found;
	}

	/** Lines holding a syntax node of the given kind, in order of appearance. */
	public linesOfSyntax(kind: ts.SyntaxKind): number[] {
		const lines: number[] = [];
		const visit = (node: ts.Node): void => {
			if (node.kind === kind) lines.push(this.lineOf(node.getStart(this.ast)));
			ts.forEachChild(node, visit);
		};
		ts.forEachChild(this.ast, visit);
		return lines;
	}

	public lineOf(position: number): number {
		return this.ast.getLineAndCharacterOfPosition(position).line + 1;
	}

	private static isExported(node: ts.ClassDeclaration): boolean {
		return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
	}

	private static moduleSpecifierOf(statement: ts.Statement): ts.StringLiteral | undefined {
		if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
			return statement.moduleSpecifier;
		}
		if (
			ts.isExportDeclaration(statement) &&
			statement.moduleSpecifier !== undefined &&
			ts.isStringLiteral(statement.moduleSpecifier)
		) {
			return statement.moduleSpecifier;
		}
		return undefined;
	}
}
