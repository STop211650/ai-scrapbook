import { SupabaseClient } from '@supabase/supabase-js';
import { ContentRepository } from '../repositories/content.repository.js';
import { EmbeddingRepository } from '../repositories/embedding.repository.js';
import { getAIProvider } from './ai/ai.service.js';
import { EnrichmentService } from './ai/enrichment.service.js';
import { detectContentType, extractUrlMetadata } from './url-extractor.service.js';
import { ContentItem, ContentType } from '../types/content.js';
import { CaptureRequest, CaptureResponse } from '../types/api.js';
import { getSummarizeService } from './summarize.service.js';

export class ContentService {
  private contentRepo: ContentRepository;
  private embeddingRepo: EmbeddingRepository;
  private enrichmentService: EnrichmentService;

  constructor(supabase: SupabaseClient) {
    this.contentRepo = new ContentRepository(supabase);
    this.embeddingRepo = new EmbeddingRepository(supabase);
    this.enrichmentService = new EnrichmentService(this.contentRepo, this.embeddingRepo);
  }

  async capture(userId: string, request: CaptureRequest): Promise<CaptureResponse> {
    const contentType = detectContentType(request.content);
    let rawContent = request.content;
    let sourceUrl: string | undefined;
    let sourceDomain: string | undefined;

    // If it's a URL, extract metadata to use as raw content
    if (contentType === 'url') {
      sourceUrl = request.content;
      const metadata = await extractUrlMetadata(request.content);
      sourceDomain = metadata.domain;
      // Use extracted text as raw content for better AI enrichment
      rawContent = [metadata.title, metadata.description, metadata.text]
        .filter(Boolean)
        .join('\n\n');
    }

    // Create the content item
    const item = await this.contentRepo.create({
      userId,
      contentType,
      rawContent,
      sourceUrl,
      sourceDomain,
      tags: request.tags,
    });

    // Fire-and-forget: enrich asynchronously
    this.enrichmentService.enrichAsync(item).catch((err) => {
      console.error('Background enrichment failed:', err);
    });

    // Fire-and-forget: summarize URLs asynchronously
    if (contentType === 'url' && sourceUrl) {
      const summarizeService = getSummarizeService();
      summarizeService
        .summarize(sourceUrl, { includeMetadata: false })
        .then((result) => this.contentRepo.update(item.id, userId, { summary: result.summary }))
        .catch(async (err) => {
          console.error('Background summarization failed:', err);

          if (!rawContent.trim()) return;

          try {
            const aiProvider = getAIProvider();
            const fallbackPrompt = `Summarize the following content:\n\n${rawContent.substring(0, 4000)}`;
            const fallback = await aiProvider.generateAnswer({
              query: fallbackPrompt,
              sources: [],
              maxTokens: 800,
            });

            await this.contentRepo.update(item.id, userId, { summary: fallback.answer });
          } catch (fallbackError) {
            console.error('Fallback summarization failed:', fallbackError);
          }
        });
    }

    return {
      id: item.id,
      status: 'captured',
      enrichment: 'pending',
    };
  }

  async getById(userId: string, id: string): Promise<ContentItem | null> {
    return this.contentRepo.findById(id, userId);
  }

  async list(
    userId: string,
    options?: { type?: ContentType; limit?: number; offset?: number }
  ): Promise<ContentItem[]> {
    return this.contentRepo.findByUserId(userId, options);
  }

  async delete(userId: string, id: string): Promise<void> {
    return this.contentRepo.delete(id, userId);
  }
}
