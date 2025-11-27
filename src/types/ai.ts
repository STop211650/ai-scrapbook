export interface EnrichmentResult {
  title: string;
  description: string;
  tags: string[];
}

export interface EnrichmentOptions {
  existingTags?: string[];
}

export interface AIProvider {
  readonly name: string;
  enrich(content: string, contentType: string, options?: EnrichmentOptions): Promise<EnrichmentResult>;
  embed(text: string): Promise<number[]>;
}

export type AIProviderType = 'openai' | 'anthropic';
