import { AdkError } from "@nestjs-adk/core";

export class GameNotFoundError extends AdkError {
	public readonly code = "PLAYGROUND_GAME_NOT_FOUND";

	public constructor(public readonly slug: string) {
		super(`The catalog has no game named ${slug}.`);
	}
}
