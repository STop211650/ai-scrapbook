import { SupabaseClient } from '@supabase/supabase-js';
import { ContentRepository } from '../repositories/content.repository';
import { EmbeddingRepository } from '../repositories/embedding.repository';
import { EnrichmentService } from './ai/enrichment.service';
import { detectContentType, extractUrlMetadata } from './url-extractor.service';
import { ContentItem, ContentType } from '../types/content';
import { CaptureRequest, CaptureResponse } from '../types/api';

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
