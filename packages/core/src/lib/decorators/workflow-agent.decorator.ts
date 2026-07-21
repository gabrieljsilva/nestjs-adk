import { Injectable } from "@nestjs/common";
import { WORKFLOW_METADATA } from "../constants";
import type { WorkflowOptions } from "../types/options";

/** Declares a deterministic workflow (sequential | parallel | loop). Workflows are agents. */
export function WorkflowAgent(options: WorkflowOptions): ClassDecorator {
	return (target) => {
		Reflect.defineMetadata(WORKFLOW_METADATA, options, target);
		Injectable()(target as unknown as Parameters<ReturnType<typeof Injectable>>[0]);
	};
}
