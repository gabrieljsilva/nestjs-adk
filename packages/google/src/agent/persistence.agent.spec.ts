import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	AdkRuntimeHost,
	AgentName,
	AgentRunCommand,
	AskInput,
	InMemoryArtifactStorage,
	SqliteSessionStorage,
} from "@nestjs-adk/core";
import { afterAll, describe, expect, it } from "vitest";
import { agentOf, apiKeyFromEnvironment, cheapModel } from "./agent-suite.fixture";
import { RandomIdGenerator } from "./random-id-generator.fixture";
import { SystemClock } from "./system-clock.fixture";

const apiKey = apiKeyFromEnvironment();
const SUPPORT = AgentName.from("support");

describe.runIf(apiKey)("AGENT: durable sessions over SQLite and real Gemini", () => {
	const directory = mkdtempSync(join(tmpdir(), "adk-sqlite-"));
	const file = join(directory, "sessions.db");

	afterAll(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	async function hostOn(storage: SqliteSessionStorage): Promise<AdkRuntimeHost> {
		if (apiKey === undefined) throw new Error("no api key");
		const host = new AdkRuntimeHost();
		await host.start(
			[agentOf(SUPPORT, "Answer in one short sentence.", cheapModel(apiKey))],
			storage,
			new InMemoryArtifactStorage(new RandomIdGenerator()),
			new SystemClock(),
			new RandomIdGenerator(),
		);
		return host;
	}

	it("continues a conversation a different process started", { timeout: 90_000 }, async () => {
		const first = SqliteSessionStorage.at(file);
		const started = await hostOn(first);
		const opening = await started.runtime.runner.ask(
			new AgentRunCommand(SUPPORT, AskInput.of("Meu nome é Gabriel. Guarde isso.")),
		);
		await started.stop();
		first.close();

		// Nothing of the first host survives: only what SQLite kept on disk.
		const second = SqliteSessionStorage.at(file);
		const restarted = await hostOn(second);
		const answer = await restarted.runtime.runner.ask(
			new AgentRunCommand(SUPPORT, AskInput.of("Qual é o meu nome?", opening.sessionId)),
		);
		const inspection = await restarted.runtime.sessions.handle(opening.sessionId);
		await restarted.stop();
		second.close();

		expect(answer.sessionId.value).toBe(opening.sessionId.value);
		expect(answer.text.toLowerCase()).toContain("gabriel");
		expect(inspection.revision.value).toBeGreaterThan(0);
		expect(inspection.isAwaitingApproval).toBe(false);
	});
});
