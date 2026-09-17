import type { RunScope } from "../run/scope/run-scope.value-object";
import type { RunProgress } from "../run/settle/run-progress.value-object";
import type { OpenedSession } from "../session/opened-session.value-object";

export abstract class DelegatedTurnLoop {
	public abstract run(scope: RunScope, opened: OpenedSession, progress: RunProgress): Promise<void>;
}
