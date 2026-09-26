import type { ArtifactStorage } from "../../../contracts/storage/artifact-storage.contract";
import { ArtifactContent } from "../../../domain/artifact/artifact-content.value-object";
import { ToolEffect } from "../../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../../domain/tool/invocation/parsed-arguments.value-object";
import type { ToolContext } from "../../../domain/tool/invocation/tool-context.value-object";
import { ToolHandler } from "../../../domain/tool/invocation/tool-handler.contract";
import { RuntimeToolRequest } from "../../../domain/tool/runtime-tool-request.value-object";
import type { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../../domain/tool/tool-schema.contract";
import type { ArtifactBudget } from "../artifact-budget.value-object";
import { ArtifactLoader } from "../artifact-loader.service";
import { ArtifactRefusal } from "../artifact-refusal.value-object";

const NAME = "edit_artifact";

const SHAPE = "<<<<<<< SEARCH\nthe exact text to find\n=======\nthe text to put there\n>>>>>>> REPLACE";

const DESCRIPTION = [
	"Changes a text artifact in place, keeping its id, with git conflict style SEARCH/REPLACE blocks.",
	"`edits` carries one or more blocks, applied in order, each against the result of the one before it.",
	"The SEARCH text is matched exactly and never fuzzily, indentation and line endings included, and it has to appear exactly once:",
	"a block that matches nothing, or matches twice, is refused and nothing at all is written, so read the part you are changing first.",
	"An empty REPLACE section deletes the SEARCH text.",
	"This tool writes, so an approval policy that holds writes holds it too and the change waits for a person.",
	`A block is written as:\n${SHAPE}`,
].join(" ");

const ANCHOR_HINT = 'Put the text you are replacing between "<<<<<<< SEARCH" and "=======".';

const EXACTNESS_HINT =
	"Matching is exact and never fuzzy, whitespace and line endings included, so read the artifact and copy the text you mean to change.";

const AMBIGUITY_HINT = "Extend the SEARCH section with the lines around it until it appears exactly once.";

const MAX_COUNTED_MATCHES = 100;

const HEAD = /^<{7}\s*SEARCH\s*$/;
const DIVIDER = /^={7}\s*$/;
const TAIL = /^>{7}\s*REPLACE\s*$/;
const MARKER_LIKE = /^(?:<{7}|={7}|>{7})/;

/**
 * Edits a text artifact in place with SEARCH/REPLACE blocks. List it in `@Agent({ tools })` for an
 * agent that is meant to change a file it was given rather than only read it.
 *
 * It declares `ToolEffect.WRITE`, so it goes through the approval policy like any other write.
 */
export class EditArtifactTool {
	public static readonly NAME = NAME;
	public static readonly MAX_COUNTED_MATCHES = MAX_COUNTED_MATCHES;

	private constructor() {}

	public static request(): RuntimeToolRequest {
		return new RuntimeToolRequest(NAME, DESCRIPTION, new EditSchema(), ToolEffect.WRITE);
	}

	public static build(storage: ArtifactStorage, budget: ArtifactBudget): ToolDefinition {
		const artifacts = new ArtifactLoader(storage, budget.maxExplorableCharacters);
		return EditArtifactTool.request().boundTo(new EditHandler(artifacts, storage, budget));
	}
}

class EditSchema extends ToolSchema {
	public declaration(): unknown {
		return {
			type: "object",
			properties: {
				artifactId: { type: "string", description: "The id shown in the artifact placeholder." },
				edits: {
					type: "string",
					description: `One or more blocks, applied in order, each written as:\n${SHAPE}`,
				},
			},
			required: ["artifactId", "edits"],
			additionalProperties: false,
		};
	}

	public parse(args: unknown): ParsedArguments {
		const record = typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
		if (typeof record.artifactId !== "string" || record.artifactId.trim().length === 0) {
			return ParsedArguments.invalid("artifactId is required and must be a non empty string.");
		}
		if (typeof record.edits !== "string" || record.edits.length === 0) {
			return ParsedArguments.invalid("edits is required and must be a non empty string of SEARCH/REPLACE blocks.");
		}
		return ParsedArguments.valid({ artifactId: record.artifactId, edits: record.edits });
	}
}

class EditBlock {
	public constructor(
		public readonly index: number,
		public readonly search: string,
		public readonly replacement: string,
	) {}
}

class MalformedEdits {
	public constructor(public readonly reason: string) {}
}

class EditHandler extends ToolHandler {
	public constructor(
		private readonly artifacts: ArtifactLoader,
		private readonly storage: ArtifactStorage,
		private readonly budget: ArtifactBudget,
	) {
		super();
	}

	public async invoke(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
		const session = context.toSessionContext();
		const loaded = await this.artifacts.loadOrRefuse(session, String(args.artifactId));
		if (loaded instanceof ArtifactRefusal) return loaded.toResult();

		const artifactId = loaded.reference.id.value;
		const blocks = parseBlocks(String(args.edits ?? ""));
		if (blocks instanceof MalformedEdits) return refuse(artifactId, blocks.reason);

		const applied: Record<string, unknown>[] = [];
		let text = loaded.content.text;
		for (const block of blocks) {
			if (block.search.length === 0) return refuse(artifactId, emptySearchReason(block.index), block.index);
			const matches = countOccurrences(text, block.search);
			if (matches !== 1) return refuse(artifactId, matchReason(block.index, matches), block.index, matches);
			const offset = text.indexOf(block.search);
			applied.push({
				block: block.index,
				line: lineAt(text, offset),
				removed: block.search.length,
				added: block.replacement.length,
			});
			text = text.slice(0, offset) + block.replacement + text.slice(offset + block.search.length);
		}

		const written = ArtifactContent.fromText(text, loaded.content.mediaType, loaded.content.name);
		const updated = await this.storage.update(session, loaded.reference, written);
		return this.budget.fit(
			{
				artifactId: updated.id.value,
				mediaType: updated.mediaType,
				blocksApplied: blocks.length,
				characters: updated.characters,
				applied,
			},
			"applied",
		);
	}
}

function parseBlocks(edits: string): EditBlock[] | MalformedEdits {
	const lines = edits.split("\n");
	const blocks: EditBlock[] = [];
	let search: string[] | undefined;
	let replacement: string[] | undefined;

	for (const [at, line] of lines.entries()) {
		const number = at + 1;
		if (search === undefined) {
			if (HEAD.test(line)) {
				search = [];
				continue;
			}
			if (MARKER_LIKE.test(line)) {
				return malformed(number, `${quote(line)} arrived while no block was open`);
			}
			continue;
		}
		if (replacement === undefined) {
			if (DIVIDER.test(line)) {
				replacement = [];
				continue;
			}
			if (HEAD.test(line)) return malformed(number, 'a second "<<<<<<< SEARCH" opened before the block was closed');
			if (MARKER_LIKE.test(line)) {
				return malformed(number, `${quote(line)} arrived where the SEARCH section still needed its "======="`);
			}
			search.push(line);
			continue;
		}
		if (TAIL.test(line)) {
			blocks.push(new EditBlock(blocks.length + 1, search.join("\n"), replacement.join("\n")));
			search = undefined;
			replacement = undefined;
			continue;
		}
		if (HEAD.test(line)) return malformed(number, 'a second "<<<<<<< SEARCH" opened before the block was closed');
		if (MARKER_LIKE.test(line)) {
			return malformed(number, `${quote(line)} arrived where the REPLACE section still needed its ">>>>>>> REPLACE"`);
		}
		replacement.push(line);
	}

	if (search !== undefined) {
		return malformed(lines.length, `block ${blocks.length + 1} was never closed with ">>>>>>> REPLACE"`);
	}
	if (blocks.length === 0)
		return new MalformedEdits(`edits carries no SEARCH/REPLACE block. Each one is written as:\n${SHAPE}`);
	return blocks;
}

function malformed(line: number, what: string): MalformedEdits {
	return new MalformedEdits(`edits is malformed at line ${line}: ${what}. Each block is written as:\n${SHAPE}`);
}

function emptySearchReason(index: number): string {
	return `block ${index} has an empty SEARCH section, and this artifact already exists, so there is nothing to insert against. ${ANCHOR_HINT}`;
}

function matchReason(index: number, matches: number): string {
	const times = matches >= MAX_COUNTED_MATCHES ? `at least ${MAX_COUNTED_MATCHES} times` : `${matches} times`;
	if (matches === 0) {
		return `block ${index} matched ${times}: nothing in the artifact is exactly its SEARCH section. ${EXACTNESS_HINT}`;
	}
	return `block ${index} matched ${times}, and an edit is only applied to a single place. ${AMBIGUITY_HINT}`;
}

function refuse(artifactId: string, reason: string, block?: number, matches?: number): Record<string, unknown> {
	return { artifactId, refused: true, reason, block, matches };
}

function countOccurrences(text: string, needle: string): number {
	let count = 0;
	let at = text.indexOf(needle);
	while (at !== -1 && count < MAX_COUNTED_MATCHES) {
		count += 1;
		at = text.indexOf(needle, at + 1);
	}
	return count;
}

function lineAt(text: string, offset: number): number {
	let line = 1;
	for (let at = text.indexOf("\n"); at !== -1 && at < offset; at = text.indexOf("\n", at + 1)) line += 1;
	return line;
}

function quote(line: string): string {
	return `"${line.trim()}"`;
}
