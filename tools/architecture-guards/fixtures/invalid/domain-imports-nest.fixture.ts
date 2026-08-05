import { Injectable } from "@nestjs/common";

@Injectable()
export class DomainImportingNest {
	public run(): string {
		return "domain must not know NestJS";
	}
}
