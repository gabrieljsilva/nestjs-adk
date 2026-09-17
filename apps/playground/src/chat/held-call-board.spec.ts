import { PendingCall, type RunContext, ToolCallId, ToolCallNotice, type ToolResultNotice } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { HeldCall, HeldCallBoard } from "./held-call-board";

/** The board reads nothing off the run, so a spec about the board hands it nothing. */
const RUN = {} as RunContext;

function noticeOf(callId: string, isHeld: boolean): ToolCallNotice {
	const effect = isHeld ? "destructive" : undefined;
	return ToolCallNotice.fromCall(
		new PendingCall(ToolCallId.from(callId), "issue_refund", { orderId: "A-1042" }, effect),
	);
}

function resultOf(callId: string): ToolResultNotice {
	return { callId: ToolCallId.from(callId), toolName: "issue_refund" } as ToolResultNotice;
}

describe("HeldCallBoard", () => {
	it("draws a card only for the calls a person has to answer", () => {
		const board = new HeldCallBoard();

		board.requested(RUN, noticeOf("c-1", true));
		board.requested(RUN, noticeOf("c-2", false));

		expect(board.awaiting.map((call) => call.callId)).toEqual(["c-1"]);
	});

	it("takes the card down when the call comes back", () => {
		const board = new HeldCallBoard();
		board.requested(RUN, noticeOf("c-1", true));

		board.settled(RUN, resultOf("c-1"));

		expect(board.awaiting).toEqual([]);
		expect(board.settledCalls).toEqual(["issue_refund"]);
	});

	it("carries the arguments the person is agreeing to, which is what makes the question answerable", () => {
		const board = new HeldCallBoard();

		board.requested(RUN, noticeOf("c-1", true));

		expect(board.awaiting[0]?.args).toEqual({ orderId: "A-1042" });
	});

	it("asks the question the way a button would say it", () => {
		expect(new HeldCall("c-1", "issue_refund", "destructive", { orderId: "A-1042" }).question).toBe(
			'Approve issue_refund (destructive) with {"orderId":"A-1042"}?',
		);
	});
});
