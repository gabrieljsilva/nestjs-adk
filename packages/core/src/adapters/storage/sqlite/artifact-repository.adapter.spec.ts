import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../../common/identity/artifact-id.value-object";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { ArtifactContent } from "../../../domain/artifact/artifact-content.value-object";
import { ArtifactRepository } from "./artifact-repository.adapter";
import { SqliteConnection } from "./sqlite-connection.adapter";

const SESSION = SessionId.from("s-1");
const OTHER = SessionId.from("s-2");
const ID = ArtifactId.from("a-1");

function repositoryOf(): ArtifactRepository {
	return new ArtifactRepository(new SqliteConnection());
}

describe("ArtifactRepository", () => {
	it("reads back what it wrote, media type included", () => {
		const repository = repositoryOf();

		repository.insert(SESSION, ID, new ArtifactContent("the report", "text/markdown"));

		expect(repository.find(SESSION, ID)?.text).toBe("the report");
		expect(repository.find(SESSION, ID)?.mediaType).toBe("text/markdown");
	});

	it("keys by the pair, so one session cannot read another's row", () => {
		const repository = repositoryOf();
		repository.insert(SESSION, ID, new ArtifactContent("private"));

		expect(repository.find(OTHER, ID)).toBeUndefined();
	});

	it("answers nothing for an id nobody wrote", () => {
		expect(repositoryOf().find(SESSION, ArtifactId.from("never-written"))).toBeUndefined();
	});

	it("writes the same pair twice as one row, so a retry is not a second artifact", () => {
		const connection = new SqliteConnection();
		const repository = new ArtifactRepository(connection);

		repository.insert(SESSION, ID, new ArtifactContent("first"));
		repository.insert(SESSION, ID, new ArtifactContent("second", "application/json"));

		expect(connection.all("SELECT artifact_id FROM session_artifacts")).toHaveLength(1);
		expect(repository.find(SESSION, ID)?.text).toBe("second");
	});

	it("removes everything one session owns and nothing anybody else's", () => {
		const repository = repositoryOf();
		repository.insert(SESSION, ID, new ArtifactContent("mine"));
		repository.insert(OTHER, ID, new ArtifactContent("theirs"));

		repository.deleteAll(SESSION);

		expect(repository.find(SESSION, ID)).toBeUndefined();
		expect(repository.find(OTHER, ID)?.text).toBe("theirs");
	});

	it("deletes a session that owns nothing without complaining", () => {
		expect(() => repositoryOf().deleteAll(SessionId.from("s-never-used"))).not.toThrow();
	});
});
