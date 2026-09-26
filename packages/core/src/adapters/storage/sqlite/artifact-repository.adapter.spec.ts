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

		repository.insert(SESSION, ID, ArtifactContent.fromText("the report", "text/markdown"));

		expect(repository.find(SESSION, ID)?.text).toBe("the report");
		expect(repository.find(SESSION, ID)?.mediaType).toBe("text/markdown");
	});

	it("keys by the pair, so one session cannot read another's row", () => {
		const repository = repositoryOf();
		repository.insert(SESSION, ID, ArtifactContent.fromText("private"));

		expect(repository.find(OTHER, ID)).toBeUndefined();
	});

	it("answers nothing for an id nobody wrote", () => {
		expect(repositoryOf().find(SESSION, ArtifactId.from("never-written"))).toBeUndefined();
	});

	it("writes the same pair twice as one row, so a retry is not a second artifact", () => {
		const connection = new SqliteConnection();
		const repository = new ArtifactRepository(connection);

		repository.insert(SESSION, ID, ArtifactContent.fromText("first"));
		repository.insert(SESSION, ID, ArtifactContent.fromText("second", "application/json"));

		expect(connection.all("SELECT artifact_id FROM session_artifacts")).toHaveLength(1);
		expect(repository.find(SESSION, ID)?.text).toBe("second");
	});

	it("reads a range of the content inside the database, so a page never loads the whole row", () => {
		const repository = repositoryOf();
		repository.insert(SESSION, ID, ArtifactContent.fromText("abcdefghij"));

		expect(repository.findRange(SESSION, ID, 2, 3)).toBe("cde");
		expect(repository.findRange(SESSION, ID, 8, 10)).toBe("ij");
		expect(repository.findRange(OTHER, ID, 0, 3)).toBeUndefined();
	});

	it("lists a session's rows newest first, up to the bound", () => {
		const repository = repositoryOf();
		repository.insert(SESSION, ArtifactId.from("a-1"), ArtifactContent.fromText("first"));
		repository.insert(SESSION, ArtifactId.from("a-2"), ArtifactContent.fromText("second"));
		repository.insert(OTHER, ArtifactId.from("a-3"), ArtifactContent.fromText("theirs"));

		expect(repository.list(SESSION, 10).map(([id]) => id.value)).toEqual(["a-2", "a-1"]);
		expect(repository.list(SESSION, 1).map(([id]) => id.value)).toEqual(["a-2"]);
	});

	it("removes everything one session owns and nothing anybody else's", () => {
		const repository = repositoryOf();
		repository.insert(SESSION, ID, ArtifactContent.fromText("mine"));
		repository.insert(OTHER, ID, ArtifactContent.fromText("theirs"));

		repository.deleteAll(SESSION);

		expect(repository.find(SESSION, ID)).toBeUndefined();
		expect(repository.find(OTHER, ID)?.text).toBe("theirs");
	});

	it("deletes a session that owns nothing without complaining", () => {
		expect(() => repositoryOf().deleteAll(SessionId.from("s-never-used"))).not.toThrow();
	});
});
