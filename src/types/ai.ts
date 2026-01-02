import { ContentType } from './content.js';

export interface EnrichmentResult {
  title: string;
  description: string;
  tags: string[];
}

export interface EnrichmentOptions {
  existingTags?: string[];
  model?: string;
}

// RAG Answer Generation types
export interface SourceContext {
  id: string;
  title: string | null;
  contentType: ContentType;
  sourceUrl: string | null;
  excerpt: string;
}

export interface GenerateAnswerOptions {
  query: string;
  sources: SourceContext[];
  maxTokens?: number;
  attachments?: Attachment[];
  model?: string;
}

export interface GenerateAnswerResult {
  answer: string;
  sourcesUsed: string[]; // Array of content item IDs that were cited
}

export type Attachment =
  | {
      kind: 'image';
      mediaType: string;
      data: string;
      filename?: string | null;
    }
  | {
      kind: 'document';
      mediaType: string;
      data: string;
      filename?: string | null;
    };

export interface AIProvider {
  readonly name: string;
  enrich(content: string, contentType: string, options?: EnrichmentOptions): Promise<EnrichmentResult>;
  embed(text: string): Promise<number[]>;
  generateAnswer(options: GenerateAnswerOptions): Promise<GenerateAnswerResult>;
}

export type AIProviderType = 'openai' | 'anthropic';
