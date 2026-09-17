import { AdkError } from "../../../common/errors/adk.error";

export class DelegationSuspendedError extends AdkError {
	public readonly code = "DELEGATION_SUSPENDED";

	public constructor(
		public readonly from: string,
		public readonly to: string,
	) {
		super(
			`Agent ${to}, delegated to by ${from}, stopped for an approval. A delegated run cannot be resumed, so declare the tool without an effect or reach ${to} by transfer instead.`,
		);
	}
}
