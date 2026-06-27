const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY!;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function isJunkEmail(email: string): boolean {
  if (/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(email)) return true;
  if (/^[a-f0-9]{20,}@/i.test(email)) return true;
  return /(example\.com|sentry|wixpress|\.wix\.com|domain\.com|email\.com|noreply|no-reply|donotreply|mailer-daemon)/i.test(email);
}

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isValidEmail(email: string): boolean {
  return EMAIL_FORMAT_RE.test(email) && email.length <= 254;
}

interface FirecrawlScrapeResponse {
  data?: { markdown?: string };
}

async function scrapePage(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

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
    if (res.status === 429) {
      console.warn(`Firecrawl: rate limited (429) for ${url} — backing off`);
      return "";
    }
    if (!res.ok) {
      console.warn(`Firecrawl: ${res.status} for ${url}`);
      return "";
    }
    const json = (await res.json()) as FirecrawlScrapeResponse;
    return json.data?.markdown ?? "";
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

export async function findWebsiteEmails(domain: string): Promise<string[]> {
  if (!domain) return [];

  const host = domain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
  if (!host) return [];

  const pagesToTry = [
    `https://${host}`,
    `https://${host}/contact`,
    `https://${host}/contact-us`,
  ];

  const contents = await Promise.all(pagesToTry.map(scrapePage));

  const allEmails = new Set<string>();
  for (const content of contents) {
    const found = (content.match(EMAIL_RE) ?? [])
      .map((e) => e.toLowerCase())
      .filter((e) => !isJunkEmail(e) && isValidEmail(e));
    found.forEach((e) => allEmails.add(e));
  }

  const sameDomain = [...allEmails].filter((e) => e.endsWith(`@${host}`));
  return sameDomain.slice(0, 3);
}
