import { NextResponse } from "next/server";
import { runStructuredResponse } from "@/lib/openai";
import type { GenerateEmailRequest, GenerateEmailResponse } from "@/lib/types";
import {
  CreatorProfileSchema,
  EmailDraftJsonSchema,
  EmailDraftSchema,
  RecommendationSchema
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_SYSTEM_PROMPT = `You are Otto, drafting a brand outreach email on behalf of a creator.

You will receive JSON: { profile, recommendation } - the recommendation includes reasoning and supportingMetrics that justify the outreach.

Write a pitch email from the creator to a brand partnership manager.

Structure:
- SUBJECT: specific and confident, under 9 words. Not clickbait.
- BODY, 120-170 words:
  1. One-line intro: who the creator is, their platform (TikTok/Instagram) and niche.
  2. The hook: 2-3 of the strongest metrics from supportingMetrics, woven into prose (not a bulleted list). Lead with the most impressive number.
  3. The ask: a specific collaboration format (e.g. "a 2-post series") anchored to what performs best per the recommendation.
  4. Low-friction close: offer a media kit or a call.

Rules:
- Use "[Brand Name]" and "[Contact Name]" as placeholders.
- Every metric mentioned must come from recommendation.supportingMetrics. No invention.
- Use only exact metric values from recommendation.supportingMetrics. Do not calculate new percentages, ratios, ranges, deltas, or comparisons.
- If you compare metrics, compare them qualitatively without introducing a new number.
- Voice: professional but human - a confident creator, not an agency. No "I hope this email finds you well." No exclamation marks in the first sentence.
- Output JSON: { "subject": string, "body": string }.`;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedProfile = CreatorProfileSchema.safeParse(body?.profile);
  const parsedRecommendation = RecommendationSchema.safeParse(body?.recommendation);

  if (!parsedProfile.success || !parsedRecommendation.success) {
    return NextResponse.json(
      { error: "Invalid request. Provide { profile, recommendation }." },
      { status: 400 }
    );
  }

  try {
    const payload: GenerateEmailRequest = {
      profile: parsedProfile.data,
      recommendation: parsedRecommendation.data
    };
    const email = await generateEmail(payload);

    return NextResponse.json(email);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate outreach email."
      },
      { status: 500 }
    );
  }
}

async function generateEmail(
  payload: GenerateEmailRequest
): Promise<GenerateEmailResponse> {
  const metricValues = payload.recommendation.supportingMetrics.map((metric) => metric.value);
  let previousError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const email = await runStructuredResponse({
      name: "EmailDraft",
      schema: EmailDraftJsonSchema,
      validator: EmailDraftSchema,
      instructions: previousError
        ? `${EMAIL_SYSTEM_PROMPT}\n\nYour previous email failed validation: ${previousError.message}\nRewrite it using only exact metric values from allowedMetricValues. Output JSON only.`
        : EMAIL_SYSTEM_PROMPT,
      input: {
        ...payload,
        allowedMetricValues: metricValues
      },
      temperature: 0.8
    });

    try {
      validateMetricUsage(email, metricValues);

      return email;
    } catch (error) {
      previousError = error instanceof Error ? error : new Error(String(error));
    }
  }

  return buildMetricsSafeFallbackEmail(payload);
}

function validateMetricUsage(email: GenerateEmailResponse, metricValues: string[]): void {
  const combinedEmail = `${email.subject}\n${email.body}`;
  const mentionedNumbers = combinedEmail.match(/\$?\d[\d,.]*(?:-\$?\d[\d,.]*)?%?|~?\d[\d,.]*[Kk]?/g) ?? [];
  const allowedNumbers = new Set(
    metricValues.flatMap((metric) =>
      (metric.match(/\$?\d[\d,.]*(?:-\$?\d[\d,.]*)?%?|~?\d[\d,.]*[Kk]?/g) ?? []).map(
        normalizeMetric
      )
    )
  );

  for (const number of mentionedNumbers) {
    if (!allowedNumbers.has(normalizeMetric(number))) {
      throw new Error(
        `Email mentioned metric "${number}" that is not present in recommendation.supportingMetrics.`
      );
    }
  }
}

function normalizeMetric(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/,/g, "")
    .replace(/\.0(?=%|$)/g, "")
    .replace(/^~/, "");
}

function buildMetricsSafeFallbackEmail(
  payload: GenerateEmailRequest
): GenerateEmailResponse {
  const metrics = payload.recommendation.supportingMetrics.slice(0, 3);
  const [primaryMetric, secondaryMetric, tertiaryMetric] = metrics;
  const platformName = payload.profile.platform === "tiktok" ? "TikTok" : "Instagram";
  const categories = payload.profile.contentCategories.slice(0, 2).join(" and ");
  const metricSentence = metrics
    .map((metric) => `${metric.label.toLowerCase()} at ${metric.value}`)
    .join(", ");

  return {
    subject: `${platformName} Fitness Partnership`,
    body: `Hi [Contact Name], I’m @${payload.profile.handle}, a ${platformName} creator focused on ${categories} content. I’m reaching out because my recent performance points to a strong fit for [Brand Name]: ${metricSentence}. The clearest opportunity is ${payload.recommendation.title.toLowerCase()}, supported by ${primaryMetric.label.toLowerCase()} of ${primaryMetric.value}${secondaryMetric ? ` and ${secondaryMetric.label.toLowerCase()} of ${secondaryMetric.value}` : ""}${tertiaryMetric ? `, alongside ${tertiaryMetric.label.toLowerCase()} of ${tertiaryMetric.value}` : ""}. I’d love to build a short creator-led post series around the format already working in my content, with the concept tailored to your current campaign goals. If useful, I can send a media kit and a few collaboration concepts, or we can set up a quick call this week.`
  };
}
