export { AdkTestBed } from "./bed/adk-test-bed.service";
export { AdkTestBedBuilder } from "./bed/adk-test-bed-builder.factory";
export { TestAgent } from "./bed/test-agent.double";
export { RecordedRun } from "./recording/recorded-run.value-object";
export { StreamedRun } from "./recording/streamed-run.value-object";
export { RecordedToolCall } from "./recording/recorded-tool-call.value-object";
export type { ToolCallOutcome } from "./recording/recorded-tool-call.value-object";
export { RunEvents } from "./recording/run-events.value-object";
export { RunRecorder } from "./recording/run-recorder.service";
export { RunTranscript } from "./recording/run-transcript.value-object";
export { RoutingModelResolver } from "./model/routing-model-resolver.service";
export { ScriptedModel } from "./model/scripted-model.double";
export { ScriptedTurn } from "./model/scripted-turn.value-object";
export type { ScriptedCall, TurnExpectation } from "./model/scripted-turn.value-object";
export { ToolFake } from "./tool-fake.double";
export type { FakeToolCall } from "./tool-fake.double";
export { AgentStub } from "./bed/agent-stub.double";
export type { StubbedAsk, StubbedDecision } from "./bed/agent-stub.double";
export { RecordingModel } from "./model/recording-model.double";
export type { RecordedModelCall } from "./model/recording-model.double";
export { TestImage } from "./test-image.support";
export { TestingEmbedder } from "./model/testing-embedder.double";
export { LlmJudge } from "./judge/llm-judge.service";
export { JudgeRubric } from "./judge/judge-rubric.value-object";
export { JudgeVerdict } from "./judge/judge-verdict.value-object";
export { ScriptDeviationError } from "./errors/script-deviation.error";
export { ScriptExhaustedError } from "./errors/script-exhausted.error";
export { ScriptMisuseError } from "./errors/script-misuse.error";
export { ScriptNotConsumedError } from "./errors/script-not-consumed.error";
export { NothingAwaitingError } from "./errors/nothing-awaiting.error";
export { UnknownTestAgentError } from "./errors/unknown-test-agent.error";
export { UnscriptedAgentError } from "./errors/unscripted-agent.error";

/**
 * The `SessionStorage` port contract, as cases any runner drives.
 *
 * It lives here and not in the core because measuring an adapter is testing: it belongs
 * next to the test bed, and `node:assert` has no business in the entry point every
 * application loads. It holds nothing an implementer could not hold, so a storage written
 * downstream is measured by exactly the cases the ones in the core answer.
 */
export { SessionStorageContractSuite } from "./session-storage-contract-suite.support";
