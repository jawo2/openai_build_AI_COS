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

const ContentChatRequestSchema = z
  .object({
    currentPlan: z.string().min(1),
    message: z.string().min(1),
    profile: CreatorProfileSchema,
    recommendation: RecommendationSchema.nullable()
  })
  .strict();

const ContentPlanSchema = z
  .object({
    concept: z.string().min(1),
    hook: z.string().min(1),
    script: z.string().min(1),
    caption: z.string().min(1)
  })
  .strict();

const ContentChatResponseSchema = z
  .object({
    reply: z.string().min(1),
    plan: ContentPlanSchema.nullable()
  })
  .strict();

const ContentChatResponseJsonSchema = zodToJsonSchema(ContentChatResponseSchema, {
  name: "ContentChatResponse",
  target: "jsonSchema7"
});

const CONTENT_CHAT_SYSTEM_PROMPT = `You are Otto, an AI Chief of Staff helping a creator execute a content recommendation.

The user is refining a short-form content plan. Answer as Otto, not as a generic chatbot.

Rules:
- Be concise: 1-3 sentences in reply.
- Ground the answer in the profile, recommendation, currentPlan, and recent performance.
- If the user asks for options, a different angle, a shorter script, hooks, captions, or any concrete edit, return an updated plan object.
- If no updated plan is needed, set plan to null.
- Do not invent metrics.
- Keep the tone direct and practical.
- Output only JSON matching the schema.`;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = ContentChatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request. Provide profile, recommendation, currentPlan, and message." },
      { status: 400 }
    );
  }

  try {
    const response = await runStructuredResponse({
      name: "ContentChatResponse",
      schema: ContentChatResponseJsonSchema,
      validator: ContentChatResponseSchema,
      instructions: CONTENT_CHAT_SYSTEM_PROMPT,
      input: parsed.data,
      temperature: 0.6
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to refine this content plan."
      },
      { status: 500 }
    );
  }
}
