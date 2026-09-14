import { describe, expect, it } from "vitest";
import { InvalidIdentityError } from "../../common/errors/invalid-identity.error";
import { SessionId } from "../../common/identity/session-id";
import { CreateSessionInput } from "./create-session-input";
import { InvalidMetadataValueError } from "./errors/invalid-metadata-value.error";
import { MetadataKey } from "./metadata-key";

describe("CreateSessionInput", () => {
	it("parses the identifier an application carried as a string", () => {
		const input = CreateSessionInput.fromOptions("chat-42");

		expect(input.sessionId?.value).toBe("chat-42");
	});

	it("keeps an identifier that was already parsed, rather than parsing it twice", () => {
		const sessionId = SessionId.from("chat-42");

		expect(CreateSessionInput.fromOptions(sessionId).sessionId).toBe(sessionId);
	});

	it("names nothing when the caller wants the runtime to choose", () => {
		const input = CreateSessionInput.fromOptions();

		expect(input.sessionId).toBeUndefined();
		expect(input.metadata.isEmpty).toBe(true);
	});

	it("converts the metadata literal an application wrote inline", () => {
		const input = CreateSessionInput.fromOptions("chat-42", { memberId: "gabriel", seats: 3 });

		expect(input.metadata.find(MetadataKey.fromName("memberId"))).toBe("gabriel");
		expect(input.metadata.size).toBe(2);
	});

	it("carries no metadata when the caller declared none", () => {
		expect(CreateSessionInput.fromOptions("chat-42").metadata.isEmpty).toBe(true);
	});

	it("refuses a metadata value no journal could hold", () => {
		expect(() => CreateSessionInput.fromOptions("chat-42", { points: Number.NaN })).toThrow(InvalidMetadataValueError);
	});

	it("refuses an identifier that names nothing", () => {
		expect(() => CreateSessionInput.fromOptions("  ")).toThrow(InvalidIdentityError);
	});
});
