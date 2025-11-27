import { SupabaseClient } from '@supabase/supabase-js';
import { ContentRepository } from '../repositories/content.repository';
import { EmbeddingRepository } from '../repositories/embedding.repository';
import { generateEmbedding } from './ai/ai.service';
import { ContentItem } from '../types/content';
import { SearchRequest, SearchResult, SearchResponse } from '../types/api';

export class SearchService {
  private contentRepo: ContentRepository;
  private embeddingRepo: EmbeddingRepository;

  constructor(supabase: SupabaseClient) {
    this.contentRepo = new ContentRepository(supabase);
    this.embeddingRepo = new EmbeddingRepository(supabase);
  }

  async search(userId: string, request: SearchRequest): Promise<SearchResponse> {
    const mode = request.mode || 'hybrid';
    const limit = request.limit || 20;

    let results: SearchResult[] = [];

    switch (mode) {
      case 'keyword':
        results = await this.keywordSearch(userId, request.query, limit);
        break;
      case 'semantic':
        results = await this.semanticSearch(userId, request.query, limit);
        break;
      case 'hybrid':
      default:
        results = await this.hybridSearch(userId, request.query, limit);
    }

    // Filter by type if specified
    if (request.types && request.types.length > 0) {
      results = results.filter((r) => request.types!.includes(r.contentType));
    }

    return {
      results,
      total: results.length,
    };
  }

  private async keywordSearch(
    userId: string,
    query: string,
    limit: number
  ): Promise<SearchResult[]> {
    const items = await this.contentRepo.keywordSearch(userId, query, limit);
    return items.map(this.itemToSearchResult);
  }

  private async semanticSearch(
    userId: string,
    query: string,
    limit: number
  ): Promise<SearchResult[]> {
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    // Search for similar items
    const similarItems = await this.embeddingRepo.searchSimilar(queryEmbedding, userId, limit);

    // Fetch full content items for the results
    const results: SearchResult[] = [];
    for (const sim of similarItems) {
      const item = await this.contentRepo.findById(sim.id, userId);
      if (item) {
        results.push({
          ...this.itemToSearchResult(item),
          score: sim.similarity,
        });
      }
    }

    return results;
  }

  private async hybridSearch(
    userId: string,
    query: string,
    limit: number
  ): Promise<SearchResult[]> {
    // Run both searches in parallel
    const [keywordResults, semanticResults] = await Promise.all([
      this.keywordSearch(userId, query, limit),
      this.semanticSearch(userId, query, limit).catch(() => []), // Fallback if embedding fails
    ]);

    // Merge results, preferring semantic matches with keyword as fallback
    const seen = new Set<string>();
    const merged: SearchResult[] = [];

    // Add semantic results first (higher quality)
    for (const result of semanticResults) {
      if (!seen.has(result.id)) {
        seen.add(result.id);
        merged.push(result);
      }
    }

    // Add keyword results that weren't in semantic
    for (const result of keywordResults) {
      if (!seen.has(result.id)) {
        seen.add(result.id);
        merged.push(result);
      }
    }

    return merged.slice(0, limit);
  }

  private itemToSearchResult(item: ContentItem): SearchResult {
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      contentType: item.contentType,
      tags: item.tags,
      sourceUrl: item.sourceUrl,
      createdAt: item.createdAt,
    };
  }
}
