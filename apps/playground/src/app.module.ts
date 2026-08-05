import { AdkModule, AdkModuleOptions, EffectApprovalPolicy, RuntimeOptions, ToolEffect } from "@nestjs-adk/core";
import { GeminiModel } from "@nestjs-adk/google";
import { Module } from "@nestjs/common";
import { ChatService } from "./support/chat.service";
import { OrdersService } from "./support/orders.service";
import { LookupOrderTool, SupportAgent } from "./support/support.agent";

const MODEL = process.env.PLAYGROUND_MODEL ?? "gemini-3.5-flash-lite";

/** Money leaving the store waits for a human; everything else runs. */
const options = new AdkModuleOptions(
	new GeminiModel(MODEL, { apiKey: process.env.GEMINI_API_KEY ?? "" }),
	undefined,
	undefined,
	undefined,
	undefined,
	new RuntimeOptions(undefined, undefined, [], undefined, EffectApprovalPolicy.from(ToolEffect.DESTRUCTIVE)),
);

@Module({
	imports: [AdkModule.forRoot(options)],
	providers: [OrdersService, LookupOrderTool, SupportAgent, ChatService],
})
export class AppModule {}
