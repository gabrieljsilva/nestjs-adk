import { SqliteConnection } from "@nestjs-adk/core";
import { Module } from "@nestjs/common";
import { StoreDatabase } from "./store-database";
import { UploadsVault } from "./uploads-vault";

export const storeConnection = new SqliteConnection(process.env.PLAYGROUND_DB ?? ":memory:");

export const uploadsVault = new UploadsVault();

@Module({
	providers: [
		{ provide: StoreDatabase, useValue: new StoreDatabase(storeConnection) },
		{ provide: UploadsVault, useValue: uploadsVault },
	],
	exports: [StoreDatabase, UploadsVault],
})
export class SharedModule {}
