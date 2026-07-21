import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AdkEngine } from "../abstracts/adk-engine";
import { ArtifactStore } from "../abstracts/artifact-store";
import { SessionStore } from "../abstracts/session-store";
import { SessionNotFoundError } from "../errors";
import { AdkModule } from "../module/adk.module";
import { InMemoryArtifactStore } from "../stores/in-memory-artifact-store";
import { InMemorySessionStore } from "../stores/in-memory-session-store";
import { AgentSessions } from "./agent-sessions";

@Injectable()
class FakeEngine extends AdkEngine {
	public async *run(): AsyncGenerator<never> {}
}

@Injectable()
class CustomSessionStore extends InMemorySessionStore {}

describe("AgentSessions + store providers in the module", () => {
	async function bootstrap(session?: typeof InMemorySessionStore) {
		const moduleRef = await Test.createTestingModule({
			imports: [AdkModule.forRoot({ engine: FakeEngine, defaultModel: "m", session })],
		}).compile();
		await moduleRef.init();
		return moduleRef;
	}

	it("without config → default in-memory SessionStore/ArtifactStore injectable via the contract", async () => {
		const app = await bootstrap();
		expect(app.get(SessionStore)).toBeInstanceOf(InMemorySessionStore);
		expect(app.get(ArtifactStore)).toBeInstanceOf(InMemoryArtifactStore);
		await app.close();
	});

	it("forRoot({ session }) swaps the default implementation", async () => {
		const app = await bootstrap(CustomSessionStore);
		expect(app.get(SessionStore)).toBeInstanceOf(CustomSessionStore);
		await app.close();
	});

	it("append injects an event into the session without triggering a run", async () => {
		const app = await bootstrap();
		const sessions = app.get(AgentSessions);

		const { id } = await sessions.create({ userId: "u1" });
		const event = await sessions.append(id, { type: "message", data: { text: "order #123 shipped" } });

		expect(event.author).toBe("system");
		expect(event.id).toBeTruthy();

		const session = await sessions.get(id);
		expect(session?.events).toHaveLength(1);
		expect(session?.events[0]?.data).toEqual({ text: "order #123 shipped" });
		await app.close();
	});

	it("append on a nonexistent session → SessionNotFoundError", async () => {
		const app = await bootstrap();
		await expect(app.get(AgentSessions).append("ghost", { type: "message", data: {} })).rejects.toBeInstanceOf(
			SessionNotFoundError,
		);
		await app.close();
	});
});
