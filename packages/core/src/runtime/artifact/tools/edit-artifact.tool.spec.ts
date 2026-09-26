import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../../adapters/storage/in-memory-artifact-storage.adapter";
import { AgentRunId } from "../../../common/identity/agent-run-id.value-object";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { AgentName } from "../../../domain/agent/agent-name.value-object";
import { ArtifactContent } from "../../../domain/artifact/artifact-content.value-object";
import { ArtifactName } from "../../../domain/artifact/artifact-name.value-object";
import { ArtifactNotFoundError } from "../../../domain/artifact/errors/artifact-not-found.error";
import { SessionContext } from "../../../domain/run/session-context.value-object";
import { ToolEffect } from "../../../domain/tool/approval/tool-effect.value-object";
import { ToolContext } from "../../../domain/tool/invocation/tool-context.value-object";
import { SequenceIdGenerator } from "../../../support/sequence-id-generator.double";
import { ArtifactBudget } from "../artifact-budget.value-object";
import { EditArtifactTool } from "./edit-artifact.tool";

const SESSION = SessionId.from("s-1");
const CTX = SessionContext.fromSessionId(SESSION);
const TOOL_CONTEXT = new ToolContext(SESSION, AgentRunId.from("r-1"), AgentName.from("editor"), ToolCallId.from("c-1"));

const report = ArtifactContent.fromText(["# Report", "", "alpha", "beta", "gamma"].join("\n"), "text/markdown");

function block(search: string, replacement: string): string {
	return `<<<<<<< SEARCH\n${search}\n=======\n${replacement}\n>>>>>>> REPLACE`;
}

function toolOf(budget = new ArtifactBudget(20_000)) {
	const storage = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
	return { tool: EditArtifactTool.build(storage, budget), storage };
}

async function editIn(content: ArtifactContent, edits: string, budget = new ArtifactBudget(20_000)) {
	const { tool, storage } = toolOf(budget);
	const reference = await storage.put(CTX, content);
	const answer = (await tool.handler.invoke({ artifactId: reference.id.value, edits }, TOOL_CONTEXT)) as Record<
		string,
		unknown
	>;
	const stored = await storage.find(CTX, reference.id);
	const kept = stored === undefined ? undefined : await storage.read(CTX, stored);
	return { answer, reference, stored, storage, text: kept?.text, content: kept };
}

describe("EditArtifactTool", () => {
	it("declares itself a write, so an approval policy that holds writes holds this one too", () => {
		const { tool } = toolOf();

		expect(tool.name).toBe("edit_artifact");
		expect(tool.effect).toBe(ToolEffect.WRITE);
		expect(tool.description).toContain("approval policy");
	});

	it("shows the model the marker shape it has to write, since a format nobody states is a format nobody follows", () => {
		const declaration = toolOf().tool.toDeclaration();

		const parameters = JSON.stringify(declaration.parameters);
		expect(parameters).toContain("<<<<<<< SEARCH");
		expect(parameters).toContain("=======");
		expect(parameters).toContain(">>>>>>> REPLACE");
		expect(declaration.description).toContain("exactly once");
	});

	it("puts the replacement where the search text was, and leaves the rest of the artifact alone", async () => {
		const { answer, text } = await editIn(report, block("beta", "delta"));

		expect(text).toBe(["# Report", "", "alpha", "delta", "gamma"].join("\n"));
		expect(answer.refused).toBeUndefined();
		expect(answer.blocksApplied).toBe(1);
	});

	it("keeps the id, because a placeholder already written into the conversation still names it", async () => {
		const { answer, reference, stored } = await editIn(report, block("beta", "delta"));

		expect(answer.artifactId).toBe(reference.id.value);
		expect(stored?.id.value).toBe(reference.id.value);
	});

	it("answers the new total size, so the current length is in front of the model and not only the old one", async () => {
		const { answer, text } = await editIn(report, block("beta", "a much longer line than before"));

		expect(answer.characters).toBe(text?.length);
		expect(answer.characters).toBeGreaterThan(report.characters);
	});

	it("keeps the media type and the name, which are what the model and the person know it by", async () => {
		const named = ArtifactContent.fromText("a,b\n1,2", "text/csv", ArtifactName.fromText("sales.csv"));

		const { answer, content } = await editIn(named, block("1,2", "3,4"));

		expect(answer.mediaType).toBe("text/csv");
		expect(content?.mediaType).toBe("text/csv");
		expect(content?.name?.value).toBe("sales.csv");
	});

	it("says where each block landed, so the model can read that part back without guessing", async () => {
		const { answer } = await editIn(report, block("gamma", "omega"));

		expect(answer.applied).toEqual([{ block: 1, line: 5, removed: 5, added: 5 }]);
	});

	it("applies several blocks in one call, in the order they were written", async () => {
		const edits = [block("alpha", "one"), block("beta", "two"), block("gamma", "three")].join("\n");

		const { answer, text } = await editIn(report, edits);

		expect(answer.blocksApplied).toBe(3);
		expect(text).toBe(["# Report", "", "one", "two", "three"].join("\n"));
	});

	it("matches a block against what the block before it produced, not against the artifact it started from", async () => {
		const edits = [block("alpha", "renamed"), block("renamed", "renamed twice")].join("\n");

		const { answer, text } = await editIn(report, edits);

		expect(answer.blocksApplied).toBe(2);
		expect(text).toContain("renamed twice");
	});

	it("deletes the search text when the replace section is empty, which is how a block removes something", async () => {
		const { answer, text } = await editIn(report, block("alpha\nbeta\n", ""));

		expect(text).toBe(["# Report", "", "gamma"].join("\n"));
		expect((answer.applied as { added: number }[])[0]?.added).toBe(0);
	});

	it("ignores prose around the blocks, because a model narrating its edit is not a malformed edit", async () => {
		const edits = `I will rename it.\n${block("beta", "delta")}\nThat is all.`;

		const { answer, text } = await editIn(report, edits);

		expect(answer.blocksApplied).toBe(1);
		expect(text).toContain("delta");
	});

	it("keeps unicode exactly as it was stored, counting characters and not bytes", async () => {
		const unicode = ArtifactContent.fromText("héllo — wörld 🙂 end", "text/plain");

		const { answer, text } = await editIn(unicode, block("wörld 🙂", "мир"));

		expect(text).toBe("héllo — мир end");
		expect(answer.characters).toBe("héllo — мир end".length);
	});

	it("matches an artifact written with CRLF exactly as it is stored, endings included", async () => {
		const crlf = ArtifactContent.fromText("alpha\r\nbeta\r\ngamma", "text/plain");
		const edits = "<<<<<<< SEARCH\r\nbeta\r\n=======\r\ndelta\r\n>>>>>>> REPLACE";

		const { answer, text } = await editIn(crlf, edits);

		expect(answer.blocksApplied).toBe(1);
		expect(text).toBe("alpha\r\ndelta\r\ngamma");
	});

	it("refuses a search written with bare newlines against an artifact written with CRLF, rather than matching it loosely", async () => {
		const crlf = ArtifactContent.fromText("alpha\r\nbeta\r\ngamma", "text/plain");

		const { answer, text } = await editIn(crlf, block("beta\ngamma", "delta"));

		expect(answer.refused).toBe(true);
		expect(answer.matches).toBe(0);
		expect(String(answer.reason)).toContain("never fuzzy");
		expect(text).toBe("alpha\r\nbeta\r\ngamma");
	});

	it("refuses a block that matches nothing, naming the block, because fuzzy matching corrupts files", async () => {
		const { answer, text } = await editIn(report, block("epsilon", "delta"));

		expect(answer.refused).toBe(true);
		expect(answer.block).toBe(1);
		expect(answer.matches).toBe(0);
		expect(String(answer.reason)).toContain("block 1 matched 0 times");
		expect(text).toBe(report.text);
	});

	it("refuses a block that matches more than once, saying how many times, since an edit needs one place", async () => {
		const repeated = ArtifactContent.fromText("total: 1\ntotal: 1\n", "text/plain");

		const { answer, text } = await editIn(repeated, block("total: 1", "total: 2"));

		expect(answer.refused).toBe(true);
		expect(answer.matches).toBe(2);
		expect(String(answer.reason)).toContain("matched 2 times");
		expect(String(answer.reason)).toContain("Extend the SEARCH section");
		expect(text).toBe(repeated.text);
	});

	it("counts overlapping places as separate matches, because two positions are two places to edit", async () => {
		const overlapping = ArtifactContent.fromText("aaa", "text/plain");

		const { answer } = await editIn(overlapping, block("aa", "b"));

		expect(answer.matches).toBe(2);
	});

	it("stops counting matches at a ceiling and says so, rather than walking a whole artifact to be exact", async () => {
		const many = ArtifactContent.fromText("x".repeat(EditArtifactTool.MAX_COUNTED_MATCHES + 50), "text/plain");

		const { answer } = await editIn(many, block("x", "y"));

		expect(answer.matches).toBe(EditArtifactTool.MAX_COUNTED_MATCHES);
		expect(String(answer.reason)).toContain(`at least ${EditArtifactTool.MAX_COUNTED_MATCHES} times`);
	});

	it("writes nothing at all when a later block is refused, so a half applied edit never reaches the store", async () => {
		const edits = [block("alpha", "one"), block("epsilon", "two")].join("\n");

		const { answer, text } = await editIn(report, edits);

		expect(answer.refused).toBe(true);
		expect(answer.block).toBe(2);
		expect(text).toBe(report.text);
	});

	it("refuses an empty search section, because an artifact that already exists gives it nothing to anchor on", async () => {
		const { answer, text } = await editIn(report, "<<<<<<< SEARCH\n=======\nnew line\n>>>>>>> REPLACE");

		expect(answer.refused).toBe(true);
		expect(answer.block).toBe(1);
		expect(String(answer.reason)).toContain("empty SEARCH section");
		expect(text).toBe(report.text);
	});

	it("treats a search section of one blank line as empty too, since it anchors on nothing either", async () => {
		const { answer } = await editIn(report, block("", "new line"));

		expect(answer.refused).toBe(true);
		expect(String(answer.reason)).toContain("empty SEARCH section");
	});

	it("refuses edits with no block at all and shows the shape, instead of failing the run over a format mistake", async () => {
		const { answer, text } = await editIn(report, "just replace beta with delta please");

		expect(answer.refused).toBe(true);
		expect(String(answer.reason)).toContain("no SEARCH/REPLACE block");
		expect(String(answer.reason)).toContain("<<<<<<< SEARCH");
		expect(String(answer.reason)).toContain(">>>>>>> REPLACE");
		expect(text).toBe(report.text);
	});

	it("refuses a block that was never closed, rather than guessing where the replacement ends", async () => {
		const { answer } = await editIn(report, "<<<<<<< SEARCH\nbeta\n=======\ndelta");

		expect(answer.refused).toBe(true);
		expect(String(answer.reason)).toContain('never closed with ">>>>>>> REPLACE"');
	});

	it("refuses a block whose search section was never ended, which is the same guess one step earlier", async () => {
		const { answer } = await editIn(report, "<<<<<<< SEARCH\nbeta");

		expect(answer.refused).toBe(true);
		expect(String(answer.reason)).toContain("never closed");
	});

	it("refuses a divider that arrives before any block was opened", async () => {
		const { answer } = await editIn(report, "=======\ndelta\n>>>>>>> REPLACE");

		expect(answer.refused).toBe(true);
		expect(String(answer.reason)).toContain("line 1");
		expect(String(answer.reason)).toContain("no block was open");
	});

	it("refuses a closing marker that arrives before any block was opened", async () => {
		const { answer } = await editIn(report, ">>>>>>> REPLACE");

		expect(answer.refused).toBe(true);
		expect(String(answer.reason)).toContain("no block was open");
	});

	it("refuses a second opening marker inside a search section, which is a block the model forgot to close", async () => {
		const { answer } = await editIn(
			report,
			"<<<<<<< SEARCH\nbeta\n<<<<<<< SEARCH\ngamma\n=======\ndelta\n>>>>>>> REPLACE",
		);

		expect(answer.refused).toBe(true);
		expect(String(answer.reason)).toContain("line 3");
		expect(String(answer.reason)).toContain("a second");
	});

	it("refuses a second opening marker inside a replace section too", async () => {
		const { answer } = await editIn(report, "<<<<<<< SEARCH\nbeta\n=======\ndelta\n<<<<<<< SEARCH\n>>>>>>> REPLACE");

		expect(answer.refused).toBe(true);
		expect(String(answer.reason)).toContain("line 5");
		expect(String(answer.reason)).toContain("a second");
	});

	it("refuses a closing marker that arrives before the divider, because the replacement would be nothing at all", async () => {
		const { answer } = await editIn(report, "<<<<<<< SEARCH\nbeta\n>>>>>>> REPLACE");

		expect(answer.refused).toBe(true);
		expect(String(answer.reason)).toContain("line 3");
		expect(String(answer.reason)).toContain('"======="');
	});

	it("refuses a second divider inside one block, rather than picking one of the two readings", async () => {
		const { answer } = await editIn(report, "<<<<<<< SEARCH\nbeta\n=======\ndelta\n=======\nomega\n>>>>>>> REPLACE");

		expect(answer.refused).toBe(true);
		expect(String(answer.reason)).toContain("line 5");
		expect(String(answer.reason)).toContain(">>>>>>> REPLACE");
	});

	it("refuses a marker line it does not recognise, instead of silently reading it as content", async () => {
		const { answer } = await editIn(report, "<<<<<<< FIND\nbeta\n=======\ndelta\n>>>>>>> REPLACE");

		expect(answer.refused).toBe(true);
		expect(String(answer.reason)).toContain("line 1");
	});

	it("refuses bytes, because there is no text in them to search for", async () => {
		const image = ArtifactContent.fromBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "image/png");

		const { answer } = await editIn(image, block("PNG", "GIF"));

		expect(answer.refused).toBe(true);
		expect(String(answer.reason)).toContain("no tool reads bytes");
	});

	it("refuses an artifact past the exploration ceiling, since editing it means loading all of it", async () => {
		const long = ArtifactContent.fromText("alpha beta gamma", "text/plain");

		const { answer, text } = await editIn(long, block("beta", "delta"), new ArtifactBudget(20_000, 5));

		expect(answer.refused).toBe(true);
		expect(String(answer.reason)).toContain("explores up to 5");
		expect(text).toBe(long.text);
	});

	it("keeps the answer inside the budget by dropping what it reports, and says it did", async () => {
		const words = Array.from({ length: 30 }, (_, at) => `word${String(at).padStart(2, "0")}`);
		const many = ArtifactContent.fromText(words.join("\n"), "text/plain");
		const edits = words.map((word) => block(word, `${word}!`)).join("\n");

		const { answer } = await editIn(many, edits, new ArtifactBudget(300));

		expect(answer.blocksApplied).toBe(30);
		expect(answer.truncated).toBe(true);
		expect((answer.applied as unknown[]).length).toBeLessThan(30);
		expect(ArtifactBudget.measure(answer)).toBeLessThanOrEqual(300);
	});

	it("raises for an id the session does not hold, which is a broken call and not a format mistake", async () => {
		const { tool } = toolOf();

		await expect(tool.handler.invoke({ artifactId: "a-never", edits: block("a", "b") }, TOOL_CONTEXT)).rejects.toThrow(
			ArtifactNotFoundError,
		);
	});

	it("refuses arguments a model wrote badly, instead of trusting them", () => {
		const schema = toolOf().tool.schema;

		expect(schema.parse({}).isValid).toBe(false);
		expect(schema.parse({ artifactId: "  ", edits: "x" }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1" }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", edits: "" }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", edits: 7 }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", edits: block("a", "b") }).values).toEqual({
			artifactId: "a-1",
			edits: block("a", "b"),
		});
	});

	it("is opt in, and the request it declares refuses until a runtime binds it", async () => {
		const request = EditArtifactTool.request();

		expect(request.name).toBe("edit_artifact");
		expect(request.effect).toBe(ToolEffect.WRITE);
		await expect(request.handler.invoke({}, TOOL_CONTEXT)).rejects.toThrow(/edit_artifact/);
	});
});
