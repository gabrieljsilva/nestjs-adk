import { describe, expect, it } from "vitest";
import { SourceFile } from "../source-file";
import { SourceIndex } from "../source-index";
import { SourcePath } from "../source-path";
import { LayerDependencyRule } from "./layer-dependency-rule";

const rule = new LayerDependencyRule();
const emptyIndex = new SourceIndex([]);

function check(path: string, source: string): ReturnType<LayerDependencyRule["check"]> {
	return rule.check(SourceFile.parse(SourcePath.of(path), source), emptyIndex);
}

describe("LayerDependencyRule", () => {
	it("is named after the key the allowlist uses", () => {
		expect(rule.name).toBe("layer-dependency");
	});

	it("rejects domain reaching into runtime", () => {
		const violations = check(
			"packages/core/src/domain/agent/thing.ts",
			'import { Runner } from "../../runtime/run/agent-runner";\nexport class Thing {}\n',
		);

		expect(violations).toHaveLength(1);
		expect(violations[0]?.message).toContain("domain must not depend on runtime");
	});

	it("rejects runtime reaching into adapters", () => {
		const violations = check(
			"packages/core/src/runtime/session/thing.ts",
			'import { Storage } from "../../adapters/storage/in-memory-session-storage";\nexport class Thing {}\n',
		);

		expect(violations).toHaveLength(1);
	});

	it("rejects public reaching into adapters", () => {
		const violations = check(
			"packages/core/src/public/thing.ts",
			'import { X } from "../adapters/nest/agent-metadata";\nexport class Thing {}\n',
		);

		expect(violations).toHaveLength(1);
	});

	it("allows runtime depending on domain", () => {
		expect(
			check(
				"packages/core/src/runtime/session/thing.ts",
				'import { Session } from "../../domain/session/session";\nexport class Thing {}\n',
			),
		).toEqual([]);
	});

	it("allows anything depending on common", () => {
		expect(
			check(
				"packages/core/src/domain/agent/thing.ts",
				'import { SessionId } from "../../common/identity/session-id";\nexport class Thing {}\n',
			),
		).toEqual([]);
	});

	it("ignores files outside the target layers", () => {
		expect(
			check(
				"packages/core/src/lib/registry/agent-registry.ts",
				'import { X } from "../../adapters/nest/agent-metadata";\nexport class Thing {}\n',
			),
		).toEqual([]);
	});

	it("ignores bare module imports, which the external rule owns", () => {
		expect(
			check(
				"packages/core/src/domain/agent/thing.ts",
				'import { Injectable } from "@nestjs/common";\nexport class T {}\n',
			),
		).toEqual([]);
	});

	it("lets a spec reach across layers to exercise a real collaborator", () => {
		expect(
			check(
				"packages/core/src/runtime/session/session-manager.spec.ts",
				'import { Storage } from "../../adapters/storage/in-memory-session-storage";\n',
			),
		).toEqual([]);
	});

	it("still holds production files to the rule in the same directory as a spec", () => {
		const violations = check(
			"packages/core/src/runtime/session/session-manager.ts",
			'import { Storage } from "../../adapters/storage/in-memory-session-storage";\nexport class M {}\n',
		);

		expect(violations).toHaveLength(1);
	});
});
