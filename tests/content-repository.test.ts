import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentRepository } from '../src/repositories/content.repository.js';

describe('ContentRepository', () => {
  describe('findByIds', () => {
    let mockSupabase: any;
    let repository: ContentRepository;

    beforeEach(() => {
      mockSupabase = {
        from: vi.fn(),
      };
      repository = new ContentRepository(mockSupabase);
    });

    it('should return empty array for empty ids list', async () => {
      const result = await repository.findByIds([], 'user-123');

      expect(result).toEqual([]);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should fetch multiple items in a single query using IN clause', async () => {
      const mockRows = [
        {
          id: 'id-1',
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
          id: 'id-2',
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

      const mockSelect = vi.fn().mockReturnThis();
      const mockIn = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockResolvedValue({ data: mockRows, error: null });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        in: mockIn,
        eq: mockEq,
      });

      const result = await repository.findByIds(['id-1', 'id-2'], 'user-123');

      // Verify single query was made with IN clause
      expect(mockSupabase.from).toHaveBeenCalledTimes(1);
      expect(mockSupabase.from).toHaveBeenCalledWith('content_items');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockIn).toHaveBeenCalledWith('id', ['id-1', 'id-2']);
      expect(mockEq).toHaveBeenCalledWith('user_id', 'user-123');

      // Verify results are transformed correctly
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('id-1');
      expect(result[0].contentType).toBe('url');
      expect(result[1].id).toBe('id-2');
      expect(result[1].contentType).toBe('text');
    });

    it('should throw error when database query fails', async () => {
      const mockError = { code: 'SOME_ERROR', message: 'Database error' };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: mockError }),
      });

      await expect(repository.findByIds(['id-1'], 'user-123')).rejects.toEqual(mockError);
    });

    it('should handle partial results when some IDs do not exist', async () => {
      // Only one item returned even though two IDs were requested
      const mockRows = [
        {
          id: 'id-1',
          user_id: 'user-123',
          content_type: 'url',
          raw_content: 'Content 1',
          source_url: 'https://example.com/1',
          source_domain: 'example.com',
          image_path: null,
          title: 'Title 1',
          description: 'Desc 1',
          tags: [],
          enrichment_status: 'completed',
          search_vector: null,
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z',
        },
      ];

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
      });

      const result = await repository.findByIds(['id-1', 'id-nonexistent'], 'user-123');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('id-1');
    });
  });
});
