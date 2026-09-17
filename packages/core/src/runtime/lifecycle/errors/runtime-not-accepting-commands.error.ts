import { AdkError } from "../../../common/errors/adk.error";

export class RuntimeNotAcceptingCommandsError extends AdkError {
	public readonly code = "RUNTIME_NOT_ACCEPTING_COMMANDS";

	public constructor(public readonly state: string) {
		super(`The runtime is ${state} and no longer accepts commands.`);
	}
}
