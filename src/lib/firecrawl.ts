const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY!;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function isJunkEmail(email: string): boolean {
  if (/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(email)) return true;
  return /(example\.com|sentry|wixpress|\.wix\.com|domain\.com|email\.com)/i.test(email);
}

interface FirecrawlScrapeResponse {
  data?: { markdown?: string };
}

async function scrapePage(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000); // 10s per page

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: false }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`Firecrawl: ${res.status} for ${url}`);
      return "";
    }
    const json = (await res.json()) as FirecrawlScrapeResponse;
    return json.data?.markdown ?? "";
  } catch {
    return ""; // timeout or network error — treated as no content
  } finally {
    clearTimeout(timer);
  }
}

export async function findWebsiteEmails(domain: string): Promise<string[]> {
  if (!domain) return [];

  const host = domain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
  if (!host) return [];

  // Homepage + likely contact pages. Scraped concurrently so the worst-case
  // scrape time is a single 10s timeout, not three back-to-back (~30s). The
  // old sequential early-exit is moot under parallelism — we always get all
  // results within one timeout window.
  const pagesToTry = [
    `https://${host}`,
    `https://${host}/contact`,
    `https://${host}/contact-us`,
  ];

  const contents = await Promise.all(pagesToTry.map(scrapePage));

  const allEmails = new Set<string>();
  for (const content of contents) {
    const found = (content.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()).filter((e) => !isJunkEmail(e));
    found.forEach((e) => allEmails.add(e));
  }

  // Only return same-domain emails — avoids BCC-ing unrelated third parties.
  const sameDomain = [...allEmails].filter((e) => e.endsWith(`@${host}`));
  return sameDomain.slice(0, 3);
}
