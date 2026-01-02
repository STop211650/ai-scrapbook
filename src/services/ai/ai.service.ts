import {
  AIProvider,
  AIProviderType,
  EnrichmentResult,
  EnrichmentOptions,
  GenerateAnswerOptions,
  GenerateAnswerResult,
} from '../../types/ai.js';
import { OpenAIProvider } from './providers/openai.provider.js';
import { AnthropicProvider } from './providers/anthropic.provider.js';
import { env } from '../../config/env.js';

let aiProvider: AIProvider | null = null;

/**
 * Create and configure the AI provider instance based on environment settings.
 *
 * Reads the provider type and default model from environment variables and constructs
 * the corresponding provider implementation (`AnthropicProvider` or `OpenAIProvider`).
 *
 * @returns An initialized `AIProvider` configured for the selected provider type.
 * @throws Error if the required API key for the chosen provider is not present in the environment.
 */
function createProvider(): AIProvider {
  const providerType = env.AI_PROVIDER as AIProviderType;
  const defaultModel = env.AI_MODEL_DEFAULT;

  switch (providerType) {
    case 'anthropic':
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER is anthropic');
      }
      return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.OPENAI_API_KEY, defaultModel);

    case 'openai':
    default:
      if (!env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required when AI_PROVIDER is openai');
      }
      return new OpenAIProvider(env.OPENAI_API_KEY, defaultModel);
  }
}

// Get singleton provider instance
export function getAIProvider(): AIProvider {
  if (!aiProvider) {
    aiProvider = createProvider();
  }
  return aiProvider;
}

// Convenience functions that use the singleton provider
export async function enrichContent(
  content: string,
  contentType: string,
  options?: EnrichmentOptions
): Promise<EnrichmentResult> {
  const provider = getAIProvider();
  return provider.enrich(content, contentType, options);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = getAIProvider();
  return provider.embed(text);
}

export async function generateAnswer(
  options: GenerateAnswerOptions
): Promise<GenerateAnswerResult> {
  const provider = getAIProvider();
  return provider.generateAnswer(options);
}