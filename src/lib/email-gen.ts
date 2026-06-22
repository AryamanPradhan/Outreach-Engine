import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface EmailInput {
  companyName: string;
  companyDescription: string;
}

interface EmailOutput {
  subject: string;
  body: string;
}

export async function generateEmail(input: EmailInput): Promise<EmailOutput> {
  const prompt = `You are writing a cold email in the style of Nick Saraev. Return ONLY valid JSON with keys "subject" and "body". No markdown, no explanation, just the JSON object.

COMPANY: ${input.companyName}
COMPANY DESCRIPTION: ${input.companyDescription}

STRUCTURE (follow exactly):
Subject: [Short subject based on the observation]

Hi Team,

[Specific observation from the company description]

[Why that observation stood out]

I spend a lot of time studying how growing businesses operate and where AI can support teams in practical, useful ways.

Curious, [one question about a challenge they likely face based on the observation]?

Open to a quick 15 to 20 min call sometime next week?

Best,

Aryaman

RULES (non-negotiable):
- Total word count must be between 80 and 120 words. Count carefully before outputting.
- Always open with "Hi Team,"
- Use ONLY information explicitly present in the company description. Do not invent or assume anything.
- Pick ONE specific observation that genuinely stands out. Do not be vague.
- Ask exactly ONE question. Ground it in the observation. It must relate to one of: growth, operations, delivery, scaling, client management, technology, or business challenges.
- Do not use hyphens anywhere in the email.
- Do not use corporate buzzwords (no leverage, synergy, streamline, empower, optimize, cutting-edge, or similar).
- Do not pitch services. Do not promise results. Do not make assumptions.
- Do not mention automation. Do not mention saving money.
- Tone must be curious, conversational, and human. Not salesy.`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.choices[0].message.content?.trim() ?? "";
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();

  try {
    return JSON.parse(cleaned) as EmailOutput;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as EmailOutput;
    throw new Error(`Failed to parse AI response as JSON: ${cleaned.slice(0, 200)}`);
  }
}
