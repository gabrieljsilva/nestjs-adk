import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage.adapter";
import { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ToolCallId } from "../../common/identity/tool-call-id.value-object";
import { CanonicalJson } from "../../common/serialization/canonical-json.service";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import { CharacterCountOffloadPolicy } from "../../domain/artifact/character-count-offload.policy";
import { ArtifactNotFoundError } from "../../domain/artifact/errors/artifact-not-found.error";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { ToolEffect } from "../../domain/tool/approval/tool-effect.value-object";
import { ToolContext } from "../../domain/tool/invocation/tool-context.value-object";
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { ArtifactBudget } from "./artifact-budget.value-object";
import { ReadArtifactTool } from "./read-artifact.tool";

const SESSION = SessionId.from("s-1");
const CTX = SessionContext.fromSessionId(SESSION);
const OTHER = SessionId.from("s-2");
const report = ArtifactContent.fromText("a very long report", "text/markdown");

function contextOf(sessionId: SessionId): ToolContext {
	return new ToolContext(sessionId, AgentRunId.from("run-1"), AgentName.from("support"), ToolCallId.from("c-1"));
}

function toolOf(threshold = 10): { tool: ToolDefinition; storage: InMemoryArtifactStorage } {
	const storage = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
	return { tool: ReadArtifactTool.forStorage(storage, CharacterCountOffloadPolicy.above(threshold)), storage };
}

/** What the model gets back, which is a page plus everything it needs to ask for the next one. */
async function readPage(args: Record<string, unknown>, threshold = 10): Promise<Record<string, unknown>> {
	const { tool, storage } = toolOf(threshold);
	const reference = await storage.put(CTX, report);
	const read = await tool.handler.invoke({ artifactId: reference.id.value, ...args }, contextOf(SESSION));
	return read as Record<string, unknown>;
}

interface Reader {
	read: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
	policy: CharacterCountOffloadPolicy;
	budget: ArtifactBudget;
}

async function openReader(text: string, threshold: number): Promise<Reader> {
	const storage = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
	const policy = CharacterCountOffloadPolicy.above(threshold);
	const tool = ReadArtifactTool.forStorage(storage, policy);
	const reference = await storage.put(CTX, ArtifactContent.fromText(text, "text/plain"));
	return {
		read: async (args: Record<string, unknown>) =>
			(await tool.handler.invoke({ artifactId: reference.id.value, ...args }, contextOf(SESSION))) as Record<
				string,
				unknown
			>,
		policy,
		budget: ArtifactBudget.fromPolicy(policy),
	};
}

async function walkByCharacter(reader: Reader, first: Record<string, unknown>): Promise<string> {
	let page = first;
	let collected = String(page.text);
	let guard = 0;
	while (page.hasMore === true) {
		guard += 1;
		expect(guard).toBeLessThan(1_000);
		expect(page.nextOffset).toBe(Number(page.offset) + String(page.text).length);
		page = await reader.read({ offset: page.nextOffset });
		collected += String(page.text);
	}
	return collected;
}

function buildShapes(threshold: number): string[] {
	const shapes: string[] = [];
	for (const length of [0, 1, 40, threshold - 200, threshold, threshold * 4]) {
		for (const count of [1, 2, 7]) {
			shapes.push(Array.from({ length: count }, (_, index) => "z".repeat(Math.max(0, length - index * 7))).join("\n"));
		}
	}
	shapes.push(`head\n${"é".repeat(threshold)}\ntail`);
	shapes.push(`"\\\n${"🚀".repeat(threshold)}`);
	return shapes;
}

function buildWindows(threshold: number): Array<Record<string, unknown>> {
	const windows: Array<Record<string, unknown>> = [{}];
	for (const limit of [undefined, 1, 64, threshold, threshold * 3]) {
		const sized = (window: Record<string, unknown>) => (limit === undefined ? window : { ...window, limit });
		for (const offset of [0, 1, threshold - 1, threshold * 9]) windows.push(sized({ offset }));
		for (const fromLine of [1, 2, 8]) {
			for (const lines of [1, 3, 200]) windows.push(sized({ fromLine, lines }));
		}
	}
	return windows;
}

describe("ReadArtifactTool", () => {
	it("declares the id and the window over it", () => {
		const declaration = toolOf().tool.toDeclaration();

		expect(declaration.name).toBe("read_artifact");
		const parameters = JSON.stringify(declaration.parameters);
		expect(parameters).toContain("artifactId");
		expect(parameters).toContain("offset");
		expect(parameters).toContain("limit");
	});

	it("declares a read, so it is held only by a policy that holds reads", () => {
		expect(toolOf().tool.effect).toBe(ToolEffect.READ);
	});

	it("keeps a full page under the threshold that would offload it, frame and all", async () => {
		const threshold = 2_000;
		const policy = CharacterCountOffloadPolicy.above(threshold);
		const storage = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
		const tool = ReadArtifactTool.forStorage(storage, policy);
		const reference = await storage.put(CTX, ArtifactContent.fromText("x".repeat(50_000), "text/plain"));

		const page = (await tool.handler.invoke({ artifactId: reference.id.value }, contextOf(SESSION))) as Record<
			string,
			unknown
		>;

		expect(String(page.text).length).toBeGreaterThan(threshold - 500);
		expect(policy.decide(CanonicalJson.stringify(page).length, "text/plain").isInline).toBe(true);
		expect(page.hasMore).toBe(true);
		expect(page.nextOffset).toBe(String(page.text).length);
	});

	it("takes the offload threshold as the page nobody asked for, because that is what fits", async () => {
		const page = await readPage({}, 12);

		expect(page.text).toBe("a very long ");
		expect(page.hasMore).toBe(true);
		expect(page.nextOffset).toBe(12);
	});

	it("says how long the whole thing is, so the model knows what it is holding a page of", async () => {
		const page = await readPage({ offset: 2, limit: 4 });

		expect(page.text).toBe("very");
		expect(page.offset).toBe(2);
		expect(page.totalCharacters).toBe(18);
		expect(page.hasMore).toBe(true);
	});

	it("says when nothing is left, so the model stops asking", async () => {
		const page = await readPage({ offset: 0, limit: 100 });

		expect(page.text).toBe(report.text);
		expect(page.hasMore).toBe(false);
		expect(page.nextOffset).toBeUndefined();
	});

	it("answers a page past the end as empty, because that is how the model finds the end", async () => {
		const page = await readPage({ offset: 500, limit: 10 });

		expect(page.text).toBe("");
		expect(page.hasMore).toBe(false);
		expect(page.offset).toBe(18);
		expect(page.totalCharacters).toBe(18);
	});

	it("reads by line when asked, which is how a line search_artifact reported becomes text", async () => {
		const { tool, storage } = toolOf(1_000);
		const reference = await storage.put(CTX, ArtifactContent.fromText("one\ntwo\nthree\nfour", "text/plain"));

		const page = (await tool.handler.invoke(
			{ artifactId: reference.id.value, fromLine: 2, lines: 2 },
			contextOf(SESSION),
		)) as Record<string, unknown>;

		expect(page.text).toBe("two\nthree");
		expect(page.fromLine).toBe(2);
		expect(page.lines).toBe(2);
		expect(page.totalLines).toBe(4);
		expect(page.hasMore).toBe(true);
		expect(page.nextLine).toBe(4);
		expect(page.nextOffset).toBeUndefined();
		expect(page.offset).toBe(4);
	});

	it("stops a line read at the character limit, so a long line cannot blow the budget", async () => {
		const { tool, storage } = toolOf(1_000);
		const reference = await storage.put(CTX, ArtifactContent.fromText("short\nlong line here\nafter", "text/plain"));

		const page = (await tool.handler.invoke(
			{ artifactId: reference.id.value, fromLine: 1, lines: 3, limit: 8 },
			contextOf(SESSION),
		)) as Record<string, unknown>;

		expect(page.text).toBe("short");
		expect(page.lines).toBe(1);
		expect(page.nextLine).toBe(2);
	});

	it("answers a line past the end as an empty page, the way a character offset does", async () => {
		const page = await readPage({ fromLine: 50, lines: 5 });

		expect(page.text).toBe("");
		expect(page.lines).toBe(0);
		expect(page.hasMore).toBe(false);
	});

	it("refuses bytes with a reason, because a page of base64 helps nobody", async () => {
		const { tool, storage } = toolOf();
		const reference = await storage.put(CTX, ArtifactContent.fromBytes(new Uint8Array([1, 2, 3]), "image/png"));

		const answer = (await tool.handler.invoke({ artifactId: reference.id.value }, contextOf(SESSION))) as Record<
			string,
			unknown
		>;

		expect(answer.refused).toBe(true);
		expect(answer.reason).toContain("image/png");
		expect(answer.text).toBeUndefined();
	});

	it("does not read an artifact of another session, even with the right id", async () => {
		const { tool, storage } = toolOf();
		const reference = await storage.put(CTX, report);

		const error = await tool.handler
			.invoke({ artifactId: reference.id.value }, contextOf(OTHER))
			.catch((reason: unknown) => reason);

		expect(error).toBeInstanceOf(ArtifactNotFoundError);
	});

	it("answers an unknown id as absent", async () => {
		const { tool } = toolOf();

		await expect(tool.handler.invoke({ artifactId: "never-written" }, contextOf(SESSION))).rejects.toBeInstanceOf(
			ArtifactNotFoundError,
		);
	});

	it("refuses arguments a model wrote badly, instead of trusting them", () => {
		const schema = toolOf().tool.schema;

		expect(schema.parse({}).isValid).toBe(false);
		expect(schema.parse({ artifactId: 42 }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "  " }).isValid).toBe(false);
		expect(schema.parse("a-1").isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", offset: -1 }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", offset: "2" }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", limit: 0 }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", fromLine: 0 }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", fromLine: 3, lines: 0 }).isValid).toBe(false);
		expect(schema.parse({ artifactId: "a-1", fromLine: 3 }).values).toEqual({
			artifactId: "a-1",
			fromLine: 3,
			lines: 200,
			limit: 10,
		});
		expect(schema.parse({ artifactId: "a-1" }).isValid).toBe(true);
		expect(schema.parse({ artifactId: "a-1", offset: 2, limit: 8 }).isValid).toBe(true);
	});

	it("fills in the page the runtime would take when the model named none", () => {
		expect(toolOf(500).tool.schema.parse({ artifactId: "a-1" }).values).toEqual({
			artifactId: "a-1",
			offset: 0,
			limit: 500,
		});
	});

	it("keeps a page of a line longer than the whole budget inside it, so its own answer is never offloaded", async () => {
		const reader = await openReader("x".repeat(50_000), 2_000);

		const page = await reader.read({ fromLine: 1 });

		expect(ArtifactBudget.measure(page)).toBeLessThanOrEqual(reader.budget.characters);
		expect(reader.policy.decide(CanonicalJson.stringify(page).length, "text/plain").isInline).toBe(true);
	});

	it("answers a line that cannot fit by character from where that line starts, because half a line reported as a whole one is data loss", async () => {
		const text = `first\n${"y".repeat(50_000)}`;
		const reader = await openReader(text, 2_000);

		const page = await reader.read({ fromLine: 2, lines: 1 });

		expect(page.offset).toBe(6);
		expect(page.fromLine).toBeUndefined();
		expect(page.lines).toBeUndefined();
		expect(page.totalLines).toBeUndefined();
		expect(page.nextLine).toBeUndefined();
		expect(String(page.text).length).toBeLessThan(50_000);
		expect(page.text).toBe(text.slice(6, 6 + String(page.text).length));
	});

	it("leads to the rest of a line too large to page, with nothing skipped between the page it gave and the next", async () => {
		const line = "y".repeat(50_000);
		const reader = await openReader(`first\n${line}`, 2_000);

		const page = await reader.read({ fromLine: 2, lines: 1 });
		const next = await reader.read({ offset: page.nextOffset });

		expect(next.offset).toBe(page.nextOffset);
		expect(String(page.text) + String(next.text)).toBe(
			line.slice(0, String(page.text).length + String(next.text).length),
		);
		expect(await walkByCharacter(reader, page)).toBe(line);
	});

	it("keeps reading by line when the first line fits, so the line numbers it reports still mean what they say", async () => {
		const first = "a".repeat(1_500);
		const reader = await openReader(`${first}\n${"b".repeat(5_000)}\ntail`, 2_000);

		const page = await reader.read({ fromLine: 1, lines: 3 });

		expect(page.text).toBe(first);
		expect(page.fromLine).toBe(1);
		expect(page.lines).toBe(1);
		expect(page.totalLines).toBe(3);
		expect(page.nextLine).toBe(2);
		expect(page.nextOffset).toBeUndefined();
		expect(ArtifactBudget.measure(page)).toBeLessThanOrEqual(reader.budget.characters);
	});

	it("reads a small artifact by line exactly as it always did, in lines and never in characters", async () => {
		const reader = await openReader("one\ntwo\nthree\nfour\nfive\nsix", 2_000);

		const page = await reader.read({ fromLine: 2, lines: 3 });

		expect(page.text).toBe("two\nthree\nfour");
		expect(page.offset).toBe(4);
		expect(page.fromLine).toBe(2);
		expect(page.lines).toBe(3);
		expect(page.totalLines).toBe(6);
		expect(page.nextLine).toBe(5);
		expect(page.nextOffset).toBeUndefined();
		expect(page.hasMore).toBe(true);
		expect(reader.policy.decide(CanonicalJson.stringify(page).length, "text/plain").isInline).toBe(true);
	});

	it("is exact on both sides of the boundary where a whole artifact stops fitting with its frame", async () => {
		const threshold = 2_000;
		let whole = 0;
		let paged = 0;
		for (let total = threshold - 200; total <= threshold + 2; total += 1) {
			const text = "c".repeat(total);
			const reader = await openReader(text, threshold);
			const page = await reader.read({});

			expect(ArtifactBudget.measure(page)).toBeLessThanOrEqual(reader.budget.characters);
			expect(reader.policy.decide(CanonicalJson.stringify(page).length, "text/plain").isInline).toBe(true);
			if (page.hasMore === false) {
				whole += 1;
				expect(page.text).toBe(text);
				expect(page.nextOffset).toBeUndefined();
			} else {
				paged += 1;
				expect(page.text).toBe(text.slice(0, String(page.text).length));
				expect(page.nextOffset).toBe(String(page.text).length);
			}
		}

		expect(whole).toBeGreaterThan(0);
		expect(paged).toBeGreaterThan(0);
	});

	it("cuts a page by the characters it counts, so content outside ASCII neither drifts over the budget nor comes back broken", async () => {
		const text = `héllo\n${'🚀 é ü \\ " '.repeat(2_000)}`;
		const reader = await openReader(text, 2_000);

		const byLine = await reader.read({ fromLine: 2, lines: 1 });
		const byCharacter = await reader.read({ offset: 0 });

		expect(ArtifactBudget.measure(byLine)).toBeLessThanOrEqual(reader.budget.characters);
		expect(ArtifactBudget.measure(byCharacter)).toBeLessThanOrEqual(reader.budget.characters);
		expect(byLine.offset).toBe(6);
		expect(byLine.totalCharacters).toBe(text.length);
		expect(await walkByCharacter(reader, byCharacter)).toBe(text);
		expect(await walkByCharacter(reader, byLine)).toBe(text.slice(6));
	});

	it("stays inside the budget for every window a model can ask for, whatever the artifact holds", async () => {
		const over: string[] = [];
		let asked = 0;
		for (const threshold of [1_000, 1_100, 2_000, 5_000]) {
			for (const [shape, text] of buildShapes(threshold).entries()) {
				const reader = await openReader(text, threshold);
				for (const window of buildWindows(threshold)) {
					const page = await reader.read(window);
					const measured = ArtifactBudget.measure(page);
					const inline = reader.policy.decide(CanonicalJson.stringify(page).length, "text/plain").isInline;
					asked += 1;
					if (measured > reader.budget.characters || !inline) {
						over.push(`threshold ${threshold}, shape ${shape}, ${JSON.stringify(window)}: ${measured}`);
					}
				}
			}
		}

		expect(over).toEqual([]);
		expect(asked).toBeGreaterThan(1_000);
	});
});
