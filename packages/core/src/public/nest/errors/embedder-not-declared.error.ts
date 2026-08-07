import { AdkError } from "../../../common/errors/adk.error";

/**
 * Somebody embedded something in an application that declared no embedder.
 *
 * It is thrown on use and never on boot, because an embedder is optional: most applications
 * never embed anything, and failing to start over a port nobody reaches would make the option
 * mandatory in practice. The message names the option to declare, since every cause of this is
 * the same missing line.
 */
export class EmbedderNotDeclaredError extends AdkError {
	public readonly code = "EMBEDDER_NOT_DECLARED";

	public constructor() {
		super("No embedder is declared. Pass one to AdkModule.forRoot as `embedder` to embed text.");
	}
}
