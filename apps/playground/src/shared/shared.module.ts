import { SqliteConnection } from "@nestjs-adk/core";
import { Module } from "@nestjs/common";
import { StoreDatabase } from "./store-database";

export const storeConnection = new SqliteConnection(process.env.PLAYGROUND_DB ?? ":memory:");

@Module({
	providers: [{ provide: StoreDatabase, useValue: new StoreDatabase(storeConnection) }],
	exports: [StoreDatabase],
})
export class SharedModule {}
