import { describe, expect, it } from "vitest";
import { MissingActorIdError } from "../errors/missing-actor-id.error";
import { Actor } from "./actor";

describe("Actor", () => {
	it("keeps the id and the claims it was given", () => {
		const actor = Actor.of("u-1", { workspaceId: "w-1", scopes: ["mcp:read"] });

		expect(actor.id).toBe("u-1");
		expect(actor.claims.workspaceId).toBe("w-1");
		expect(actor.claims.scopes).toEqual(["mcp:read"]);
	});

	it("trims the id and refuses an empty one", () => {
		expect(Actor.of("  u-1 ").id).toBe("u-1");
		expect(() => Actor.of("   ")).toThrow(MissingActorIdError);
	});

	it("is equal by id alone", () => {
		expect(Actor.of("u-1", { role: "owner" }).equals(Actor.of("u-1", { role: "member" }))).toBe(true);
		expect(Actor.of("u-1").equals(Actor.of("u-2"))).toBe(false);
	});

	it("cannot be changed after it was built", () => {
		const claims = { role: "member" };
		const actor = Actor.of("u-1", claims);
		claims.role = "owner";

		expect(actor.claims.role).toBe("member");
		expect(Object.isFrozen(actor)).toBe(true);
		expect(Object.isFrozen(actor.claims)).toBe(true);
	});

	it("reads as its id", () => {
		expect(String(Actor.of("u-1"))).toBe("u-1");
	});
});
