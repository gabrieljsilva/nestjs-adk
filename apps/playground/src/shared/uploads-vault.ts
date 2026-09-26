import type { MediaPart } from "@nestjs-adk/core";
import { Injectable } from "@nestjs/common";

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
