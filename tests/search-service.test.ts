import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchService } from '../src/services/search.service.js';

// Mock the AI service module
vi.mock('../src/services/ai/ai.service.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

describe('SearchService', () => {
  describe('semanticSearch batch fetching', () => {
    let mockSupabase: any;
    let searchService: SearchService;

    beforeEach(() => {
      vi.clearAllMocks();

      mockSupabase = {
        from: vi.fn(),
        rpc: vi.fn(),
      };

      searchService = new SearchService(mockSupabase);
    });

    it('should use findByIds for batch fetching instead of N individual queries', async () => {
      // Track how many times .from('content_items') is called
      const fromCalls: string[] = [];
      const mockContentItems = [
        {
          id: 'item-1',
          user_id: 'user-123',
          content_type: 'url',
          raw_content: 'Content 1',
          source_url: 'https://example.com/1',
          source_domain: 'example.com',
          image_path: null,
          title: 'Title 1',
          description: 'Desc 1',
          tags: ['tag1'],
          enrichment_status: 'completed',
          search_vector: null,
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'item-2',
          user_id: 'user-123',
          content_type: 'text',
          raw_content: 'Content 2',
          source_url: null,
          source_domain: null,
          image_path: null,
          title: 'Title 2',
          description: 'Desc 2',
          tags: ['tag2'],
          enrichment_status: 'completed',
          search_vector: null,
          created_at: '2025-01-02T00:00:00.000Z',
          updated_at: '2025-01-02T00:00:00.000Z',
        },
      ];

      // Mock RPC call for semantic search
      mockSupabase.rpc.mockResolvedValue({
        data: [
          { id: 'item-1', similarity: 0.95 },
          { id: 'item-2', similarity: 0.85 },
        ],
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        fromCalls.push(table);

        if (table === 'content_items') {
          // This is the batch fetch
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: mockContentItems, error: null }),
          };
        }

        return {};
      });

      const result = await searchService.search('user-123', {
        query: 'test query',
        mode: 'semantic',
        limit: 10,
      });

      // Verify batch fetch was used (only 1 call to content_items, not N)
      const contentItemsCalls = fromCalls.filter((t) => t === 'content_items');
      expect(contentItemsCalls).toHaveLength(1);

      // Verify results are returned correctly
      expect(result.results).toHaveLength(2);
      expect(result.results[0].id).toBe('item-1');
      expect(result.results[0].score).toBe(0.95);
      expect(result.results[1].id).toBe('item-2');
      expect(result.results[1].score).toBe(0.85);
    });

    it('should return empty array when no similar items found', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: [], error: null });

      const result = await searchService.search('user-123', {
        query: 'test query',
        mode: 'semantic',
        limit: 10,
      });

      expect(result.results).toHaveLength(0);
      // from() should NOT be called since no items to fetch
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should preserve original similarity order from embedding search', async () => {
      // Items returned in different order than similarity ranking
      const mockContentItems = [
        {
          id: 'item-2', // lower similarity, but returned first from DB
          user_id: 'user-123',
          content_type: 'url',
          raw_content: 'Content 2',
          source_url: null,
          source_domain: null,
          image_path: null,
          title: 'Title 2',
          description: 'Desc 2',
          tags: [],
          enrichment_status: 'completed',
          search_vector: null,
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'item-1', // higher similarity
          user_id: 'user-123',
          content_type: 'url',
          raw_content: 'Content 1',
          source_url: null,
          source_domain: null,
          image_path: null,
          title: 'Title 1',
          description: 'Desc 1',
          tags: [],
          enrichment_status: 'completed',
          search_vector: null,
          created_at: '2025-01-02T00:00:00.000Z',
          updated_at: '2025-01-02T00:00:00.000Z',
        },
      ];

      // RPC returns items ordered by similarity
      mockSupabase.rpc.mockResolvedValue({
        data: [
          { id: 'item-1', similarity: 0.95 }, // highest similarity first
          { id: 'item-2', similarity: 0.75 },
        ],
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'content_items') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: mockContentItems, error: null }),
          };
        }
        return {};
      });

      const result = await searchService.search('user-123', {
        query: 'test query',
        mode: 'semantic',
        limit: 10,
      });

      // Results should be ordered by similarity (item-1 first), not DB return order
      expect(result.results[0].id).toBe('item-1');
      expect(result.results[0].score).toBe(0.95);
      expect(result.results[1].id).toBe('item-2');
      expect(result.results[1].score).toBe(0.75);
    });
  });
});
