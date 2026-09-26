import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../../common/identity/artifact-id.value-object";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { ArtifactContent } from "../../artifact/artifact-content.value-object";
import { ArtifactReference } from "../../artifact/artifact-reference.value-object";
import { ToolEffect } from "../approval/tool-effect.value-object";
import { ParsedArguments } from "../invocation/parsed-arguments.value-object";
import { ToolHandler } from "../invocation/tool-handler.contract";
import { ToolOutcome } from "../invocation/tool-outcome.value-object";
import { ToolDefinition } from "../tool-definition.value-object";
import { ToolSchema } from "../tool-schema.contract";
import { ToolResultNotice } from "./tool-result.notice";

class AnySchema extends ToolSchema {
	public declaration(): unknown {
		return { type: "object" };
	}

	public parse(): ParsedArguments {
		return ParsedArguments.valid({});
	}
}

class NoopHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return {};
	}
}

const CALL = ToolCallId.from("c-1");
describe("ToolResultNotice", () => {
	it("hands over what the journal records for a result", () => {
		const notice = new ToolResultNotice(ToolOutcome.succeeded(CALL, "lookup", { status: "shipped" }, "shipped"));

		expect(notice.callId).toBe(CALL);
		expect(notice.toolName).toBe("lookup");
		expect(notice.output).toEqual({ status: "shipped" });
		expect(notice.failed).toBe(false);
		expect(notice.isRefused).toBe(false);
		expect(notice.reason).toBeUndefined();
	});

	it("carries the reason of a failure as the model reads it", () => {
		const notice = new ToolResultNotice(ToolOutcome.failed(CALL, "lookup", "boom"));

		expect(notice.failed).toBe(true);
		expect(notice.isRefused).toBe(false);
		expect(notice.reason).toBe("boom");
	});

	it("tells a refusal apart from an error", () => {
		const notice = new ToolResultNotice(ToolOutcome.refused(CALL, "refund", "the order stays open"));

		expect(notice.failed).toBe(true);
		expect(notice.isRefused).toBe(true);
		expect(notice.reason).toBe("the order stays open");
	});

	it("shows the placeholder and the reference for a result that was offloaded, never the content", () => {
		const reference = ArtifactReference.fromContent(
			ArtifactId.from("a-1"),
			SessionId.from("s-1"),
			ArtifactContent.fromText("a very long report"),
		);
		const notice = new ToolResultNotice(
			ToolOutcome.succeeded(CALL, "report", { rows: 10_000 }, reference.toString(), reference),
		);

		expect(notice.output.artifactId).toBe("a-1");
		expect(notice.output.rows).toBeUndefined();
	});
});
