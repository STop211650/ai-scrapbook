import { AIProvider, AIProviderType, EnrichmentResult, EnrichmentOptions } from '../../types/ai';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { env } from '../../config/env';

let aiProvider: AIProvider | null = null;

// Factory function to create the appropriate provider
function createProvider(): AIProvider {
  const providerType = env.AI_PROVIDER as AIProviderType;

  switch (providerType) {
    case 'anthropic':
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER is anthropic');
      }
      return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.OPENAI_API_KEY);

    case 'openai':
    default:
      if (!env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required when AI_PROVIDER is openai');
      }
      return new OpenAIProvider(env.OPENAI_API_KEY);
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
