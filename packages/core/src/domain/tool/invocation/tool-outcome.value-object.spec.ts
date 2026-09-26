import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../../common/identity/artifact-id.value-object";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { ArtifactContent } from "../../artifact/artifact-content.value-object";
import { ArtifactReference } from "../../artifact/artifact-reference.value-object";
import { ToolOutcome } from "./tool-outcome.value-object";

const CALL = ToolCallId.from("c-1");
const reference = ArtifactReference.fromContent(
	ArtifactId.from("a-1"),
	SessionId.from("s-1"),
	ArtifactContent.fromText("a very long report"),
);

describe("ToolOutcome", () => {
	it("keeps the canonical output and what the model reads as the same thing when nothing moved", () => {
		const outcome = ToolOutcome.succeeded(CALL, "lookup", { status: "shipped" }, '{"status":"shipped"}');

		expect(outcome.output).toEqual({ status: "shipped" });
		expect(outcome.contextOutput).toBe('{"status":"shipped"}');
		expect(outcome.wasOffloaded).toBe(false);
	});

	it("keeps them apart when the result was too large for the context", () => {
		const outcome = ToolOutcome.succeeded(CALL, "report", { rows: 10_000 }, reference.toString(), reference);

		expect(outcome.contextOutput).toContain("a-1");
		expect(outcome.output).toEqual({ rows: 10_000 });
		expect(outcome.wasOffloaded).toBe(true);
	});

	it("reports a failure as an outcome the model can read", () => {
		const outcome = ToolOutcome.failed(CALL, "refund", "the order was already refunded");

		expect(outcome.failed).toBe(true);
		expect(outcome.contextOutput).toBe("the order was already refunded");
		expect(outcome.output.error).toBe("the order was already refunded");
	});

	it("reports a refusal apart from an error, and still as a failure the model does not retry", () => {
		const outcome = ToolOutcome.refused(CALL, "refund", "the order stays open");

		expect(outcome.failed).toBe(true);
		expect(outcome.contextOutput).toBe("the order stays open");
		expect(outcome.output).toEqual({ refused: true, reason: "the order stays open" });
		expect(outcome.output.error).toBeUndefined();
	});

	it("ties every outcome to the call that asked for it", () => {
		expect(ToolOutcome.failed(CALL, "refund", "x").callId.value).toBe("c-1");
	});

	it("records the placeholder and the id, never the content it just moved out", () => {
		const outcome = ToolOutcome.succeeded(CALL, "report", { rows: 10_000 }, reference.toString(), reference);

		expect(outcome.recordedOutput.artifactId).toBe("a-1");
		expect(outcome.recordedOutput.characters).toBe(reference.characters);
		expect(String(outcome.recordedOutput.value)).toContain("a-1");
		expect(outcome.recordedOutput.rows).toBeUndefined();
	});

	it("records the result itself when it fit, so nothing is wrapped for no reason", () => {
		const outcome = ToolOutcome.succeeded(CALL, "lookup", { status: "shipped" }, '{"status":"shipped"}');

		expect(outcome.recordedOutput).toEqual({ status: "shipped" });
	});
});
