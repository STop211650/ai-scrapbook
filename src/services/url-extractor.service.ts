import * as cheerio from 'cheerio';

export interface UrlMetadata {
  title: string | null;
  description: string | null;
  domain: string;
  text: string;
}

// Adapted from summarize/src/content/asset.ts to normalize pasted URLs.
function normalizeUrlInput(raw: string): string {
  return (
    raw
      // Common shell copy/paste mistakes: `\?` / `\=` / `\&` inside quotes.
      .replaceAll(/\\([?&=])/g, '$1')
      // Sometimes backslashes get percent-encoded (`%5C`) and end up right before separators.
      .replaceAll(/%5c(?=[?&=])/gi, '')
  );
}

function trimLikelyUrlPunctuation(raw: string): string {
  let value = raw.trim();
  const hasUnbalancedClosing = (input: string, open: string, close: string): boolean => {
    let openCount = 0;
    let closeCount = 0;
    for (const char of input) {
      if (char === open) openCount += 1;
      else if (char === close) closeCount += 1;
    }
    return closeCount > openCount;
  };
  while (value.length > 0 && /[)\].,;:'">}”’»]/.test(value[value.length - 1] ?? '')) {
    const last = value[value.length - 1] ?? '';
    if (last === ')' && !hasUnbalancedClosing(value, '(', ')')) break;
    if (last === ']' && !hasUnbalancedClosing(value, '[', ']')) break;
    if (last === '}' && !hasUnbalancedClosing(value, '{', '}')) break;
    value = value.slice(0, -1);
  }
  while (value.length > 0 && /^[('"<{[\]“‘«]/.test(value[0] ?? '')) {
    value = value.slice(1);
  }
  return value;
}

// Convert URLs to scraper-friendly alternatives (avoids JS rendering and login walls)
function getScrapableUrl(url: string): string {
  const parsedUrl = new URL(url);
  const host = parsedUrl.hostname;

  // X/Twitter -> Nitter
  if (host === 'x.com' || host === 'twitter.com' || host === 'www.x.com' || host === 'www.twitter.com') {
    return `https://nitter.poast.org${parsedUrl.pathname}`;
  }

  // Reddit -> Old Reddit (static HTML, no JS required)
  if (host === 'reddit.com' || host === 'www.reddit.com') {
    return `https://old.reddit.com${parsedUrl.pathname}${parsedUrl.search}`;
  }

  return url;
}

export async function extractUrlMetadata(url: string): Promise<UrlMetadata> {
  const normalizedUrl = trimLikelyUrlPunctuation(normalizeUrlInput(url));
  const parsedUrl = new URL(normalizedUrl);
  let domain = parsedUrl.hostname;

  // Use scraper-friendly alternatives for certain sites
  const fetchUrl = getScrapableUrl(normalizedUrl);

  try {
    const response = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AIScrapbook/1.0)',
      },
    });

    if (!response.ok) {
      return { title: null, description: null, domain, text: url };
    }

    try {
      if (response.url) {
        domain = new URL(response.url).hostname;
      }
    } catch {
      // Ignore invalid response URLs; keep original domain.
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
  const normalizedInput = trimLikelyUrlPunctuation(normalizeUrlInput(input));
  // Check if it's a URL
  try {
    const parsed = new URL(normalizedInput);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'data:') {
      return 'url';
    }
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
