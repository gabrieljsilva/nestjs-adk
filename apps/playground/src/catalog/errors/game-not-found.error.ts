import { AdkError } from "@nestjs-adk/core";

/**
 * The catalog has no title under that name.
 *
 * A tool that answers this to the model is answering something true, so the error carries
 * the name that was asked for: the run recovers by asking for one that exists, and it can
 * only do that if it is told which one it got wrong.
 */
export class GameNotFoundError extends AdkError {
	public readonly code = "PLAYGROUND_GAME_NOT_FOUND";

	public constructor(public readonly slug: string) {
		super(`The catalog has no game named ${slug}.`);
	}
}
