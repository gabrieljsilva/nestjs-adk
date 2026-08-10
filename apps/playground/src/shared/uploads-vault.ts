import type { MediaPart } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";

/**
 * The files customers handed the store, kept by the id the store gave back.
 *
 * This is the application-owned side of an attachment: a question names the upload by id
 * and the runtime asks back, on every projection, what that id becomes now. In memory
 * here for the same reason the catalog is SQLite; a real store would keep a bucket, and
 * the resolver in the module options is the only place that would change.
 */
@Injectable()
export class UploadsVault {
	private readonly files = new Map<string, MediaPart>();

	public put(id: string, file: MediaPart): void {
		this.files.set(id, file);
	}

	public find(id: string): MediaPart | undefined {
		return this.files.get(id);
	}
}
