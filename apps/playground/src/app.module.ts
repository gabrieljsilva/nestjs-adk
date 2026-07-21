import { AdkModule } from "@nestjs-adk/core";
import { GoogleAdkEngine } from "@nestjs-adk/google";
import { Module } from "@nestjs/common";
import { ChatService } from "./support/chat.service";
import { GeminiEmbedder } from "./support/gemini.embedder";
import { OrdersService } from "./support/orders.service";
import { LookupOrderTool, SupportAgent } from "./support/support.agent";

@Module({
	imports: [
		AdkModule.forRoot({
			engine: GoogleAdkEngine,
			embedder: GeminiEmbedder,
			defaultModel: process.env.PLAYGROUND_MODEL ?? "gemini-3.1-flash-lite",
			logging: "verbose",
		}),
	],
	providers: [OrdersService, LookupOrderTool, SupportAgent, ChatService],
})
export class AppModule {}
