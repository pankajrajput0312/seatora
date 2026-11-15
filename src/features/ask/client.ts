import "server-only";
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";

// One Bedrock (Mantle) client per process. Auth: AWS_BEARER_TOKEN_BEDROCK (a Bedrock API key), region AWS_REGION.
// Retries 429 / 5xx / connection errors twice; the route sets the overall deadline.
let client: AnthropicBedrockMantle | null = null;
export const askClient = () => (client ??= new AnthropicBedrockMantle({ awsRegion: process.env.AWS_REGION || "us-east-1", maxRetries: 2 }));
export type AskClient = Pick<AnthropicBedrockMantle, "messages">;
