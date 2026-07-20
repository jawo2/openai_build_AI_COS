import { NextResponse } from "next/server";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { runStructuredResponse } from "@/lib/openai";
import { CreatorProfileSchema, RecommendationSchema } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NextActionToolSchema = z.enum([
  "draft_outreach",
  "explain_proof",
  "define_test",
  "assess_risk",
  "build_pricing",
  "create_plan"
]);

const NextActionSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    tool: NextActionToolSchema,
    icon: z.string().min(1)
  })
  .strict();

const NextActionsSchema = z
  .object({
    actions: z.array(NextActionSchema).min(3).max(5)
  })
  .strict();

const NextActionsJsonSchema = zodToJsonSchema(NextActionsSchema, {
  name: "NextActions",
  target: "jsonSchema7"
});

const NEXT_ACTIONS_SYSTEM_PROMPT = `You are Otto, generating contextual next actions for one creator-business mission.

Input JSON includes:
- profile
- recommendation
- assistantMessage
- recentConversation

Return 3 to 5 action chips. Each action must be specific to this recommendation and must help the user move the mission forward.

Rules:
- Do not sound like a generic chatbot.
- Anchor actions to the selected recommendation, its actionType, reasoning, and supportingMetrics.
- Use concise action titles, 2-5 words.
- description should explain the workflow in one sentence.
- tool must be one of: draft_outreach, explain_proof, define_test, assess_risk, build_pricing, create_plan.
- icon must be a short lowercase icon keyword: mail, chart, checklist, shield, tag, spark.
- Prefer draft_outreach for outreach recommendations.
- Prefer define_test or create_plan for content recommendations.
- Prefer build_pricing for pricing recommendations.
- Output JSON only.`;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedProfile = CreatorProfileSchema.safeParse(body?.profile);
  const parsedRecommendation = RecommendationSchema.safeParse(body?.recommendation);
  const assistantMessage = z.string().min(1).safeParse(body?.assistantMessage);
  const recentConversation = z
    .array(
      z
        .object({
          role: z.enum(["otto", "user"]),
          content: z.string()
        })
        .strict()
    )
    .max(8)
    .safeParse(body?.recentConversation ?? []);

  if (
    !parsedProfile.success ||
    !parsedRecommendation.success ||
    !assistantMessage.success ||
    !recentConversation.success
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid request. Provide { profile, recommendation, assistantMessage, recentConversation }."
      },
      { status: 400 }
    );
  }

  try {
    const actions = await runStructuredResponse({
      name: "NextActions",
      schema: NextActionsJsonSchema,
      validator: NextActionsSchema,
      instructions: NEXT_ACTIONS_SYSTEM_PROMPT,
      input: {
        profile: parsedProfile.data,
        recommendation: parsedRecommendation.data,
        assistantMessage: assistantMessage.data,
        recentConversation: recentConversation.data
      },
      temperature: 0.4
    });

    return NextResponse.json(actions);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate next actions."
      },
      { status: 500 }
    );
  }
}
