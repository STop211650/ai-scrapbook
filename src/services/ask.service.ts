import { SupabaseClient } from '@supabase/supabase-js';
import { ContentRepository } from '../repositories/content.repository.js';
import { SearchService } from './search.service.js';
import { generateAnswer } from './ai/ai.service.js';
import { AskRequest, AskResponse, AskSource } from '../types/api.js';
import { SourceContext } from '../types/ai.js';

export class AskService {
  private contentRepo: ContentRepository;
  private searchService: SearchService;

  constructor(supabase: SupabaseClient) {
    this.contentRepo = new ContentRepository(supabase);
    this.searchService = new SearchService(supabase);
  }

  async ask(userId: string, request: AskRequest): Promise<AskResponse> {
    const { query, limit = 5, mode = 'hybrid', model } = request;

    // Step 1: Search for relevant content using existing search infrastructure
    const searchResults = await this.searchService.search(userId, {
      query,
      mode,
      limit,
    });

    if (searchResults.results.length === 0) {
      return {
        answer:
          "I couldn't find any relevant content in your library to answer this question.",
        sources: [],
        totalSourcesSearched: 0,
      };
    }

    // Step 2: Batch fetch full content for all search results (avoids N+1 problem)
    const resultIds = searchResults.results.map((r) => r.id);
    const fullItems = await this.contentRepo.findByIds(resultIds, userId);
    const itemsById = new Map(fullItems.map((item) => [item.id, item]));

    // Build source contexts preserving search result order
    const sourceContexts: SourceContext[] = searchResults.results
      .map((result) => {
        const fullItem = itemsById.get(result.id);
        if (!fullItem) return null;
        return {
          id: fullItem.id,
          title: fullItem.title,
          contentType: fullItem.contentType,
          sourceUrl: fullItem.sourceUrl,
          // Truncate excerpt to avoid token limits; keep first 1500 chars per source
          excerpt: this.truncateContent(fullItem.rawContent, 1500),
        };
      })
      .filter((ctx): ctx is SourceContext => ctx !== null);

    // Step 3: Generate AI answer with citations
    const result = await generateAnswer({
      query,
      sources: sourceContexts,
      maxTokens: 1500,
      model,
    });

    // Step 4: Build response with source metadata for cited sources only
    // Create a map of source ID to citation number (1-indexed)
    const citedSourcesMap = new Map<string, number>();
    sourceContexts.forEach((source, index) => {
      if (result.sourcesUsed.includes(source.id)) {
        citedSourcesMap.set(source.id, index + 1);
      }
    });

    const sources: AskSource[] = result.sourcesUsed
      .map((id) => {
        const source = sourceContexts.find((s) => s.id === id);
        if (!source) return null;
        return {
          id: source.id,
          title: source.title,
          contentType: source.contentType,
          sourceUrl: source.sourceUrl,
          citationNumber: citedSourcesMap.get(id)!,
        };
      })
      .filter((s): s is AskSource => s !== null)
      .sort((a, b) => a.citationNumber - b.citationNumber);

    return {
      answer: result.answer,
      sources,
      totalSourcesSearched: searchResults.total,
    };
  }

  // Truncate content to specified length, trying to break at sentence boundary
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Try to truncate at a sentence boundary
    const truncated = content.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('. '),
      truncated.lastIndexOf('.\n'),
      truncated.lastIndexOf('! '),
      truncated.lastIndexOf('? ')
    );

    if (lastSentenceEnd > maxLength * 0.5) {
      return truncated.substring(0, lastSentenceEnd + 1);
    }

    return truncated + '...';
  }
}
