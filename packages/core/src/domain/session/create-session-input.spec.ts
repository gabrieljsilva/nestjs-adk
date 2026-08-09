import { describe, expect, it } from "vitest";
import { InvalidIdentityError } from "../../common/errors/invalid-identity.error";
import { SessionId } from "../../common/identity/session-id";
import { CreateSessionInput } from "./create-session-input";

describe("CreateSessionInput", () => {
	it("parses the identifier an application carried as a string", () => {
		const input = CreateSessionInput.of("chat-42");

		expect(input.sessionId?.value).toBe("chat-42");
	});

	it("keeps an identifier that was already parsed, rather than parsing it twice", () => {
		const sessionId = SessionId.from("chat-42");

		expect(CreateSessionInput.of(sessionId).sessionId).toBe(sessionId);
	});

	it("names nothing when the caller wants the runtime to choose", () => {
		const input = CreateSessionInput.of();

		expect(input.sessionId).toBeUndefined();
		expect(input.owner).toBeUndefined();
	});

	it("records the owner the application identifies its user by", () => {
		expect(CreateSessionInput.of("chat-42", "gabriel").owner?.value).toBe("gabriel");
	});

	it("treats an owner that says nothing as no owner at all", () => {
		expect(CreateSessionInput.of("chat-42", "   ").owner).toBeUndefined();
	});

	it("refuses an identifier that names nothing", () => {
		expect(() => CreateSessionInput.of("  ")).toThrow(InvalidIdentityError);
	});
});
