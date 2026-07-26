import { Injectable } from "@nestjs/common";
import type { EmbedderOptions } from "../abstracts/adk-embedder";
import { EMBEDDER_METADATA } from "../constants";

export function Embedder(options: EmbedderOptions): ClassDecorator {
	return (target) => {
		Reflect.defineMetadata(EMBEDDER_METADATA, options, target);
		Injectable()(target as unknown as Parameters<ReturnType<typeof Injectable>>[0]);
	};
}
