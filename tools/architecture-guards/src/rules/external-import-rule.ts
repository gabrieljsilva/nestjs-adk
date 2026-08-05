import { Layer } from "../layer";
import type { SourceFile } from "../source-file";
import type { SourceIndex } from "../source-index";
import { Violation } from "../violation";
import { ArchitectureRule } from "./architecture-rule";

const NEST_PREFIX = "@nestjs/";
const WIRELY_PREFIX = "@wirely/";
const NEST_ADAPTER_PREFIX = "packages/core/src/adapters/nest/";
const WIRELY_COMPOSITION_PREFIX = "packages/core/src/runtime/composition/";
const PROVIDER_MODULES = ["@google/", "openai", "@anthropic-ai/"];

/**
 * Where each foreign dependency is allowed to appear.
 * Wirely is matched by module text alone, so the rule holds before the package is
 * ever installed.
 */
export class ExternalImportRule extends ArchitectureRule {
	public readonly name = "external-import";

	public check(file: SourceFile, _index: SourceIndex): Violation[] {
		const layer = file.path.layer;
		if (!layer.isKnown) return [];

		const violations: Violation[] = [];
		for (const reference of file.imports()) {
			if (reference.isRelative) continue;
			const reason = this.reject(reference.module, layer, file.path.value);
			if (reason === undefined) continue;
			violations.push(new Violation(file.path, this.name, reference.line, reason));
		}
		return violations;
	}

	private reject(module: string, layer: Layer, path: string): string | undefined {
		if (module.startsWith(NEST_PREFIX) && !this.allowsNest(layer, path)) {
			return `${layer} must not import ${module}; NestJS belongs to public and adapters/nest.`;
		}
		if (module.startsWith(WIRELY_PREFIX) && !path.startsWith(WIRELY_COMPOSITION_PREFIX)) {
			return `${layer} must not import ${module}; Wirely belongs to runtime/composition.`;
		}
		if (this.isProviderSdk(module) && !layer.equals(Layer.ADAPTERS)) {
			return `${layer} must not import ${module}; provider SDKs belong to adapters.`;
		}
		return undefined;
	}

	private allowsNest(layer: Layer, path: string): boolean {
		return layer.equals(Layer.PUBLIC) || path.startsWith(NEST_ADAPTER_PREFIX);
	}

	private isProviderSdk(module: string): boolean {
		return PROVIDER_MODULES.some((prefix) => module === prefix || module.startsWith(prefix));
	}
}
