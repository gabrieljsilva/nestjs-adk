import { dirname, join } from "node:path";
import { Layer } from "../layer";
import type { SourceFile } from "../source-file";
import type { SourceIndex } from "../source-index";
import { SourcePath } from "../source-path";
import { Violation } from "../violation";
import { ArchitectureRule } from "./architecture-rule";

/**
 * Keeps relative imports pointing the way the layer arrows do.
 *
 * Specs are exempt on purpose. The arrows constrain what ships: a test that drives a
 * runtime service against the real in memory adapter is exercising the collaboration
 * the arrows describe, not violating it, and forcing it to use a local double would
 * only prove that the double behaves like the double.
 */
export class LayerDependencyRule extends ArchitectureRule {
	public readonly name = "layer-dependency";

	public check(file: SourceFile, _index: SourceIndex): Violation[] {
		if (file.path.isSpec) return [];

		const layer = file.path.layer;
		if (!layer.isKnown) return [];

		const violations: Violation[] = [];
		for (const reference of file.imports()) {
			if (!reference.isRelative) continue;
			const target = this.resolve(file.path.value, reference.module).layer;
			if (!target.isKnown || layer.canDependOn(target)) continue;
			violations.push(new Violation(file.path, this.name, reference.line, `${layer} must not depend on ${target}.`));
		}
		return violations;
	}

	private resolve(from: string, module: string): SourcePath {
		return SourcePath.of(join(dirname(from), module));
	}
}
