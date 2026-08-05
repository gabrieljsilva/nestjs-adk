import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { AgentName } from "../agent/agent-name";
import { DelegateInput } from "./delegate-input";

describe("DelegateInput", () => {
	it("names the session, both agents and the task in full", () => {
		const input = new DelegateInput(
			SessionId.from("s-1"),
			AgentName.from("support"),
			AgentName.from("researcher"),
			"find the refund window",
		);

		expect(input.sessionId.value).toBe("s-1");
		expect(input.from.value).toBe("support");
		expect(input.to.value).toBe("researcher");
		expect(input.task).toBe("find the refund window");
	});
});
