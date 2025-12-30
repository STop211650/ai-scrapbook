import { ContentRepository } from '../../repositories/content.repository.js';
import { EmbeddingRepository } from '../../repositories/embedding.repository.js';
import { enrichContent, generateEmbedding } from './ai.service.js';
import { ContentItem } from '../../types/content.js';

export class EnrichmentService {
  constructor(
    private contentRepo: ContentRepository,
    private embeddingRepo: EmbeddingRepository
  ) {}

  // Fire-and-forget enrichment - logs errors but doesn't throw
  async enrichAsync(item: ContentItem): Promise<void> {
    try {
      // Fetch existing tags for consistency
      const existingTags = await this.contentRepo.getAllTags(item.userId);

      // Generate AI metadata with existing tags for consistency
      const enriched = await enrichContent(item.rawContent, item.contentType, {
        existingTags,
      });

      // Update the content item with enriched data
      await this.contentRepo.update(item.id, item.userId, {
        title: enriched.title,
        description: enriched.description,
        tags: enriched.tags,
        enrichmentStatus: 'completed',
      });

      // Generate and store embedding
      const textForEmbedding = [
        enriched.title,
        enriched.description,
        item.rawContent,
      ]
        .filter(Boolean)
        .join('\n');

      const embedding = await generateEmbedding(textForEmbedding);
      await this.embeddingRepo.store(item.id, embedding);

      console.log(`Enrichment completed for item ${item.id}`);
    } catch (error) {
      console.error(`Enrichment failed for item ${item.id}:`, error);

      // Mark as failed but don't re-throw (silent failure per design)
      try {
        await this.contentRepo.update(item.id, item.userId, {
          enrichmentStatus: 'failed',
        });
      } catch (updateError) {
        console.error(`Failed to update status for item ${item.id}:`, updateError);
      }
    }
  }
}
