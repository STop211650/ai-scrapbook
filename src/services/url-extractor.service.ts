import * as cheerio from 'cheerio';

export interface UrlMetadata {
  title: string | null;
  description: string | null;
  domain: string;
  text: string;
}

// Convert X/Twitter URLs to Nitter for scraping (avoids JS rendering and login walls)
function getNitterUrl(url: string): string | null {
  const parsedUrl = new URL(url);
  const host = parsedUrl.hostname;

  if (host === 'x.com' || host === 'twitter.com' || host === 'www.x.com' || host === 'www.twitter.com') {
    // Nitter instances - using nitter.poast.org as it's currently reliable
    return `https://nitter.poast.org${parsedUrl.pathname}`;
  }
  return null;
}

export async function extractUrlMetadata(url: string): Promise<UrlMetadata> {
  const parsedUrl = new URL(url);
  const domain = parsedUrl.hostname;

  // Use Nitter for X/Twitter URLs
  const fetchUrl = getNitterUrl(url) || url;

  try {
    const response = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AIScrapbook/1.0)',
      },
    });

    if (!response.ok) {
      return { title: null, description: null, domain, text: url };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract title (prefer og:title, then <title>)
    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      null;

    // Extract description (prefer og:description, then meta description)
    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      null;

    // Extract main text content (simplified - just get readable text)
    // Remove script, style, nav, footer, header elements
    $('script, style, nav, footer, header, aside, [role="navigation"]').remove();

    const text = $('article, main, [role="main"], .content, #content, body')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000);

    return {
      title: title?.trim() || null,
      description: description?.trim() || null,
      domain,
      text: text || url,
    };
  } catch (error) {
    console.error(`Failed to extract metadata from ${url}:`, error);
    return { title: null, description: null, domain, text: url };
  }
}

// Detect content type from input
export function detectContentType(input: string): 'url' | 'text' | 'image' {
  // Check if it's a URL
  try {
    new URL(input);
    return 'url';
  } catch {
    // Not a URL
  }

  // Check if it's base64 image data
  if (
    input.startsWith('data:image/') ||
    (input.length > 100 && /^[A-Za-z0-9+/=]+$/.test(input.substring(0, 100)))
  ) {
    return 'image';
  }

  return 'text';
}
