import { createContainer } from "@wirely/core";

export class ComposesOutsideComposition {
	public build(): unknown {
		return createContainer();
	}
}
