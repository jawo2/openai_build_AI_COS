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

const BrandChatRequestSchema = z
  .object({
    currentEmail: z.string().min(1),
    message: z.string().min(1),
    profile: CreatorProfileSchema,
    recommendation: RecommendationSchema
  })
  .strict();

const BrandChatResponseSchema = z
  .object({
    reply: z.string().min(1),
    email: z
      .object({
        subject: z.string().min(1),
        body: z.string().min(1)
      })
      .strict()
      .nullable()
  })
  .strict();

const BrandChatResponseJsonSchema = zodToJsonSchema(BrandChatResponseSchema, {
  name: "BrandChatResponse",
  target: "jsonSchema7"
});

const BRAND_CHAT_SYSTEM_PROMPT = `You are Otto, an AI Chief of Staff helping a creator act on a brand outreach opportunity.

The user is editing or discussing a drafted outreach email. Answer as Otto, not as a generic chatbot.

Rules:
- Be concise: 2-5 sentences unless the user asks for a rewrite.
- Ground the answer in the provided creator profile, recommendation, supportingMetrics, and current email.
- If the user asks for an edit, rewrite, shortening, tone change, different brand, or asks for an email, return the rewritten email in email.body and a short subject in email.subject.
- When email is present, reply should be one short sentence introducing the updated draft. Do not put the full email in reply.
- When email is not needed, set email to null.
- Do not invent metrics, brands, or claims.
- End with a concrete next step when useful.
- Output only JSON matching the schema.`;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = BrandChatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request. Provide profile, recommendation, currentEmail, and message." },
      { status: 400 }
    );
  }

  try {
    const response = await runStructuredResponse({
      name: "BrandChatResponse",
      schema: BrandChatResponseJsonSchema,
      validator: BrandChatResponseSchema,
      instructions: BRAND_CHAT_SYSTEM_PROMPT,
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
            : "Unable to send this message to Otto."
      },
      { status: 500 }
    );
  }
}
