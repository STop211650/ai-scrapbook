import { SupabaseClient } from '@supabase/supabase-js';
import {
  QueryMemory,
  QueryMemoryRow,
  RecordMemoryInput,
  rowToQueryMemory,
} from '../types/memory.js';

export class MemoryRepository {
  constructor(private supabase: SupabaseClient) {}

  async record(input: RecordMemoryInput): Promise<QueryMemory> {
    const { data, error } = await this.supabase
      .from('query_memory')
      .insert({
        user_id: input.userId,
        query: input.query,
        search_mode: input.searchMode,
        endpoint: input.endpoint,
        top_results: input.topResults,
        result_count: input.resultCount,
      })
      .select()
      .single();

    if (error) throw error;
    return rowToQueryMemory(data as QueryMemoryRow);
  }

  async getRecent(
    userId: string,
    options?: { limit?: number; offset?: number; since?: Date }
  ): Promise<{ memories: QueryMemory[]; total: number }> {
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;

    // Build query for fetching memories
    let query = this.supabase
      .from('query_memory')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Filter by date if provided
    if (options?.since) {
      query = query.gte('created_at', options.since.toISOString());
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      memories: (data as QueryMemoryRow[]).map(rowToQueryMemory),
      total: count || 0,
    };
  }
}
