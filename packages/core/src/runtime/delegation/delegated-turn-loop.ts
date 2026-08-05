import type { RunProgress } from "../run/run-progress";
import type { RunScope } from "../run/run-scope";
import type { OpenedSession } from "../session/opened-session";

/**
 * What a delegation needs from the loop, and nothing more.
 *
 * The runtime graph has exactly one cycle: the loop runs turns, a turn may delegate, and a
 * delegation runs turns. Naming the smaller half of it here keeps the delegation runner
 * from depending on the whole loop, and keeps the cycle visible instead of implied.
 */
export abstract class DelegatedTurnLoop {
	public abstract run(scope: RunScope, opened: OpenedSession, progress: RunProgress): Promise<void>;
}
