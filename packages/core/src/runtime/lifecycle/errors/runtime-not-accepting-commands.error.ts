import { AdkError } from "../../../common/errors/adk.error";

/**
 * A command arrived while the runtime was shutting down.
 * A pending approval that was already persisted is not affected: it is stored state,
 * not a live execution, and can be resumed by the next process.
 */
export class RuntimeNotAcceptingCommandsError extends AdkError {
	public readonly code = "RUNTIME_NOT_ACCEPTING_COMMANDS";

	public constructor(public readonly state: string) {
		super(`The runtime is ${state} and no longer accepts commands.`);
	}
}
