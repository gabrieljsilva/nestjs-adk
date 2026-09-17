import { AdkError } from "../../../common/errors/adk.error";

/** Text was embedded and no `embedder` was declared on the module. */
export class EmbedderNotDeclaredError extends AdkError {
	public readonly code = "EMBEDDER_NOT_DECLARED";

	public constructor() {
		super("No embedder is declared. Pass one to AdkModule.forRoot as `embedder` to embed text.");
	}
}
