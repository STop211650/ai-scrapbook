import { SupabaseClient } from '@supabase/supabase-js';
import { ContentRepository } from '../repositories/content.repository';
import { ContentItem } from '../types/content';

export class ExportService {
  private contentRepo: ContentRepository;

  constructor(supabase: SupabaseClient) {
    this.contentRepo = new ContentRepository(supabase);
  }

  async exportToMarkdown(userId: string, since?: Date): Promise<string> {
    const items = await this.contentRepo.findByUserId(userId, { limit: 1000 });

    // Filter by date if specified
    const filtered = since
      ? items.filter((item) => item.createdAt >= since)
      : items;

    // Generate markdown for each item
    const markdownItems = filtered.map((item) => this.itemToMarkdown(item));

    return markdownItems.join('\n\n---\n\n');
  }

  private itemToMarkdown(item: ContentItem): string {
    const frontmatter = this.generateFrontmatter(item);
    const body = this.generateBody(item);
    return `${frontmatter}\n\n${body}`;
  }

  private generateFrontmatter(item: ContentItem): string {
    const tags = item.tags.map((t) => `"${t}"`).join(', ');
    const lines = [
      '---',
      `id: ${item.id}`,
      `created: ${item.createdAt.toISOString()}`,
      `type: ${item.contentType}`,
      `tags: [${tags}]`,
    ];

    if (item.sourceUrl) {
      lines.push(`source: ${item.sourceUrl}`);
    }

    lines.push('---');
    return lines.join('\n');
  }

  private generateBody(item: ContentItem): string {
    const sections: string[] = [];

    // Title
    const title = item.title || 'Untitled';
    sections.push(`# ${title}`);

    // Description
    if (item.description) {
      sections.push(item.description);
    }

    // Source link for URLs
    if (item.sourceUrl) {
      sections.push(`**Source:** [${item.sourceDomain || item.sourceUrl}](${item.sourceUrl})`);
    }

    // Original content
    if (item.rawContent && item.rawContent.length > 0) {
      sections.push('## Original Content\n');
      // Truncate very long content
      const content =
        item.rawContent.length > 2000
          ? item.rawContent.substring(0, 2000) + '...'
          : item.rawContent;
      sections.push(content);
    }

    // Tags as Obsidian-style tags
    if (item.tags.length > 0) {
      const tagLinks = item.tags.map((t) => `#${t}`).join(' ');
      sections.push(`\n**Tags:** ${tagLinks}`);
    }

    return sections.join('\n\n');
  }

  // Export as a zip file with individual markdown files (future enhancement)
  async exportAsZip(userId: string): Promise<Buffer> {
    // For now, just return the combined markdown as a buffer
    const markdown = await this.exportToMarkdown(userId);
    return Buffer.from(markdown, 'utf-8');
  }
}
