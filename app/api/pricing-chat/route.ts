import { NextResponse } from "next/server";
import { runStructuredResponse } from "@/lib/openai";
import {
  CreatorProfileSchema,
  RecommendationSchema
} from "@/lib/types";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PricingRateRowSchema = z
  .object({
    label: z.string().min(1),
    value: z.string().min(1)
  })
  .strict();

const PricingChatRequestSchema = z
  .object({
    currentRates: z.array(PricingRateRowSchema).min(1),
    message: z.string().min(1),
    profile: CreatorProfileSchema,
    recommendation: RecommendationSchema.nullable()
  })
  .strict();

const PricingChatResponseSchema = z
  .object({
    note: z.string().nullable(),
    rates: z.array(PricingRateRowSchema).nullable(),
    reply: z.string().min(1)
  })
  .strict();

const PricingChatResponseJsonSchema = zodToJsonSchema(PricingChatResponseSchema, {
  name: "PricingChatResponse",
  target: "jsonSchema7"
});

const PRICING_CHAT_SYSTEM_PROMPT = `You are Otto, an AI Chief of Staff helping a creator price sponsored work.

The user is discussing a creator rate card. Answer as Otto, not as a generic chatbot.

Rules:
- Be concise: 1-3 sentences in reply.
- Ground the answer in the creator profile, recommendation, currentRates, and supportingMetrics.
- If the user asks about a specific brand, paid ad, usage rights, whitelisting, exclusivity, bundle, rush work, or any concrete pricing adjustment, return updated rates.
- Rate values must be formatted as ranges without the currency prefix, for example "520-650". The UI adds "S/".
- Preserve the same row labels unless the user asks for a new package.
- If no updated rate card is needed, set rates to null and note to null.
- Do not invent metrics, audience facts, or benchmark claims.
- Output only JSON matching the schema.`;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = PricingChatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request. Provide profile, recommendation, currentRates, and message." },
      { status: 400 }
    );
  }

  try {
    const response = await runStructuredResponse({
      name: "PricingChatResponse",
      schema: PricingChatResponseJsonSchema,
      validator: PricingChatResponseSchema,
      instructions: PRICING_CHAT_SYSTEM_PROMPT,
      input: parsed.data,
      temperature: 0.5
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update pricing."
      },
      { status: 500 }
    );
  }
}
