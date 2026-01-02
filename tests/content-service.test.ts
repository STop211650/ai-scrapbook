import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentService } from '../src/services/content.service.js';

let mockContentRepo: any;
let mockEmbeddingRepo: any;
let mockEnrichmentService: any;
let mockSummarizeService: any;
let mockAIProvider: any;

vi.mock('../src/repositories/content.repository.js', () => ({
  ContentRepository: class {
    constructor() {
      return mockContentRepo;
    }
  },
}));

vi.mock('../src/repositories/embedding.repository.js', () => ({
  EmbeddingRepository: class {
    constructor() {
      return mockEmbeddingRepo;
    }
  },
}));

vi.mock('../src/services/ai/enrichment.service.js', () => ({
  EnrichmentService: class {
    constructor() {
      return mockEnrichmentService;
    }
  },
}));

vi.mock('../src/services/ai/ai.service.js', () => ({
  getAIProvider: vi.fn(() => mockAIProvider),
}));

vi.mock('../src/services/url-extractor.service.js', () => ({
  detectContentType: vi.fn(),
  extractUrlMetadata: vi.fn(),
}));

vi.mock('../src/services/summarize.service.js', () => ({
  getSummarizeService: vi.fn(() => mockSummarizeService),
}));

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const mockItem = {
  id: 'item-1',
  userId: 'user-123',
  contentType: 'url',
  rawContent: 'Raw content',
  sourceUrl: 'https://example.com',
  sourceDomain: 'example.com',
  imagePath: null,
  title: 'Example title',
  description: 'Example description',
  summary: null,
  tags: ['tag1'],
  enrichmentStatus: 'pending',
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
};

describe('ContentService.capture', () => {
  beforeEach(() => {
    mockContentRepo = {
      create: vi.fn().mockResolvedValue({ ...mockItem }),
      update: vi.fn().mockResolvedValue({ ...mockItem, summary: 'summary' }),
    };

    mockEmbeddingRepo = {};

    mockEnrichmentService = {
      enrichAsync: vi.fn().mockResolvedValue(undefined),
    };

    mockSummarizeService = {
      summarize: vi.fn().mockResolvedValue({ summary: 'Summary from summarize service' }),
    };

    mockAIProvider = {
      generateAnswer: vi.fn().mockResolvedValue({ answer: 'Fallback summary', sourcesUsed: [] }),
    };

    vi.clearAllMocks();
  });

  it('summarizes URL content asynchronously and stores summary', async () => {
    const { detectContentType, extractUrlMetadata } = await import(
      '../src/services/url-extractor.service.js'
    );

    detectContentType.mockReturnValue('url');
    extractUrlMetadata.mockResolvedValue({
      title: 'Example title',
      description: 'Example description',
      text: 'Example text',
      domain: 'example.com',
    });

    const service = new ContentService({} as any);

    const response = await service.capture('user-123', {
      content: 'https://example.com',
      tags: ['tag1'],
    });

    expect(response).toEqual({
      id: 'item-1',
      status: 'captured',
      enrichment: 'pending',
    });

    await flushPromises();

    expect(mockSummarizeService.summarize).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        includeMetadata: false,
      })
    );
    expect(mockContentRepo.update).toHaveBeenCalledWith('item-1', 'user-123', {
      summary: 'Summary from summarize service',
    });
  });

  it('falls back to summarizing extracted metadata when summarize service fails', async () => {
    const { detectContentType, extractUrlMetadata } = await import(
      '../src/services/url-extractor.service.js'
    );

    detectContentType.mockReturnValue('url');
    extractUrlMetadata.mockResolvedValue({
      title: 'Example title',
      description: 'Example description',
      text: 'Example text',
      domain: 'example.com',
    });

    mockSummarizeService.summarize.mockRejectedValue(new Error('Summarize failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const service = new ContentService({} as any);

    await service.capture('user-123', {
      content: 'https://example.com',
      tags: ['tag1'],
    });

    await flushPromises();

    errorSpy.mockRestore();

    expect(mockAIProvider.generateAnswer).toHaveBeenCalled();
    expect(mockContentRepo.update).toHaveBeenCalledWith('item-1', 'user-123', {
      summary: 'Fallback summary',
    });
  });

  it('does not attempt summarization for non-URL content', async () => {
    const { detectContentType } = await import('../src/services/url-extractor.service.js');

    detectContentType.mockReturnValue('text');

    const service = new ContentService({} as any);

    await service.capture('user-123', {
      content: 'Some plain text',
      tags: ['tag1'],
    });

    await flushPromises();

    expect(mockSummarizeService.summarize).not.toHaveBeenCalled();
    expect(mockContentRepo.update).not.toHaveBeenCalled();
    expect(mockEnrichmentService.enrichAsync).toHaveBeenCalled();
  });

  it('passes model override to summarization and enrichment', async () => {
    const { detectContentType, extractUrlMetadata } = await import(
      '../src/services/url-extractor.service.js'
    );

    detectContentType.mockReturnValue('url');
    extractUrlMetadata.mockResolvedValue({
      title: 'Example title',
      description: 'Example description',
      text: 'Example text',
      domain: 'example.com',
    });

    const service = new ContentService({} as any);

    await service.capture('user-123', {
      content: 'https://example.com',
      tags: ['tag1'],
      model: 'model-override',
    });

    await flushPromises();

    expect(mockSummarizeService.summarize).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        includeMetadata: false,
        model: 'model-override',
      })
    );
    expect(mockEnrichmentService.enrichAsync).toHaveBeenCalledWith(
      expect.any(Object),
      'model-override'
    );
  });
});
