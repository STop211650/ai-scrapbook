import { SupabaseClient } from '@supabase/supabase-js';
import { MemoryRepository } from '../repositories/memory.repository';
import { MemoryQuery, MemoryResponse } from '../types/api';
import { SearchMode, MemoryEndpoint, TopResult } from '../types/memory';

export class MemoryService {
  private memoryRepo: MemoryRepository;

  constructor(supabase: SupabaseClient) {
    this.memoryRepo = new MemoryRepository(supabase);
  }

  /**
   * Record a query to memory. This is fire-and-forget - errors are logged but not thrown.
   */
  async recordQuery(
    userId: string,
    query: string,
    searchMode: SearchMode,
    endpoint: MemoryEndpoint,
    topResults: TopResult[],
    resultCount: number
  ): Promise<void> {
    try {
      // Limit to top 5 results to keep payload light
      const limitedResults = topResults.slice(0, 5);

      await this.memoryRepo.record({
        userId,
        query,
        searchMode,
        endpoint,
        topResults: limitedResults,
        resultCount,
      });
    } catch (error) {
      // Log but don't throw - memory recording shouldn't block the response
      console.error('Failed to record query memory:', error);
    }
  }

  /**
   * Get recent query memory for a user.
   */
  async getMemory(userId: string, options: MemoryQuery): Promise<MemoryResponse> {
    let since: Date | undefined;

    if (options.since) {
      const parsedDate = new Date(options.since);
      if (isNaN(parsedDate.getTime())) {
        throw new Error('Invalid date format for since parameter');
      }
      since = parsedDate;
    }

    const result = await this.memoryRepo.getRecent(userId, {
      limit: options.limit,
      offset: options.offset,
      since,
    });

    return {
      memories: result.memories,
      total: result.total,
    };
  }
}
