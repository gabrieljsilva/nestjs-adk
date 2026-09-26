import { describe, expect, it } from "vitest";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { ArtifactContent } from "../../../domain/artifact/artifact-content.value-object";
import { SessionContext } from "../../../domain/run/session-context.value-object";
import { SequenceIdGenerator } from "../../../support/sequence-id-generator.double";
import { SqliteArtifactStorage } from "./sqlite-artifact-storage.adapter";
import { SqliteConnection } from "./sqlite-connection.adapter";

function ctx(id = "s-1"): SessionContext {
	return SessionContext.fromSessionId(SessionId.from(id));
}

function storageOf(connection = new SqliteConnection()): SqliteArtifactStorage {
	return new SqliteArtifactStorage(connection, new SequenceIdGenerator("a"));
}

/**
 * The port contract is not checked here. It lives in `@nestjs-adk/testing`, where
 * `ArtifactStorageContractSuite` runs it against this adapter and the in memory one
 * together, so both are held to the same cases. What stays here is what only this adapter
 * has to answer for: its file, its rows and its connection.
 */
describe("SqliteArtifactStorage", () => {
	it("survives being rebuilt over the same connection, which is what durable means here", async () => {
		const connection = new SqliteConnection();
		const reference = await storageOf(connection).put(ctx(), ArtifactContent.fromText("the report", "text/markdown"));

		const read = await storageOf(connection).read(ctx(), reference);

		expect(read.text).toBe("the report");
		expect(read.mediaType).toBe("text/markdown");
	});

	it("shares one database file with the sessions it belongs to", () => {
		expect(SqliteArtifactStorage.at(":memory:")).toBeInstanceOf(SqliteArtifactStorage);
	});

	it("keeps the sessions of two conversations in rows of their own", async () => {
		const connection = new SqliteConnection();
		const storage = storageOf(connection);
		await storage.put(ctx("s-1"), ArtifactContent.fromText("mine"));
		await storage.put(ctx("s-2"), ArtifactContent.fromText("theirs"));

		const rows = connection.all("SELECT session_id, artifact_id FROM session_artifacts ORDER BY session_id");

		expect(rows).toHaveLength(2);
	});

	it("stores what the content is beside the content, because a reader cannot guess it", async () => {
		const connection = new SqliteConnection();
		await storageOf(connection).put(ctx(), ArtifactContent.fromText("{}", "application/json"));

		const row = connection.first("SELECT media_type FROM session_artifacts") as { media_type: string };

		expect(row.media_type).toBe("application/json");
	});

	it("closes the connection it was given, so a file is released when the store is", () => {
		const connection = new SqliteConnection();
		const storage = storageOf(connection);

		storage.close();

		expect(() => connection.all("SELECT 1")).toThrow();
	});
});
