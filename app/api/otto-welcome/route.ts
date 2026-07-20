import { CreatorProfileSchema, RecommendationSchema } from "@/lib/types";
import { DEFAULT_MODEL, openai } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WELCOME_SYSTEM_PROMPT = `You are Otto, a proactive AI Chief of Staff for a creator business.

Write the first message Otto sends after analysis completes.

Structure exactly:
1. Greeting. Use "Good morning, Jaime".
2. Main insight. Explain the single highest-impact opportunity discovered.
3. Supporting reasoning. Reference exact supporting metrics and reasoning from the recommendation.
4. Proactive work. Explain what Otto has already prepared.
5. End with exactly: "What would you like me to do next?"

Rules:
- Do not sound like a generic chatbot.
- Do not say you are waiting for instructions.
- Only mention exact metric values from allowedMetricValues.
- Do not calculate or introduce new percentages, ratios, averages, multipliers, deltas, or comparisons.
- Do not mention metrics from profile unless that exact value is also in allowedMetricValues.
- Keep it concise, under 140 words.
- Mention prepared assets generally, not as a long list.
- Plain text only.`;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedProfile = CreatorProfileSchema.safeParse(body?.profile);
  const parsedRecommendation = RecommendationSchema.safeParse(body?.recommendation);

  if (!parsedProfile.success || !parsedRecommendation.success) {
    return new Response("Invalid request. Provide { profile, recommendation }.", {
      status: 400
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const responseStream = await openai.responses.create({
          model: DEFAULT_MODEL,
          instructions: WELCOME_SYSTEM_PROMPT,
          input: JSON.stringify({
            allowedMetricValues: parsedRecommendation.data.supportingMetrics.map(
              (metric) => metric.value
            ),
            profile: {
              contentCategories: parsedProfile.data.contentCategories,
              handle: parsedProfile.data.handle,
              platform: parsedProfile.data.platform
            },
            recommendation: parsedRecommendation.data
          }),
          temperature: 0.5,
          store: false,
          stream: true
        });

        for await (const event of responseStream) {
          if (event.type === "response.output_text.delta") {
            controller.enqueue(
              encoder.encode(`event: delta\ndata: ${JSON.stringify({ delta: event.delta })}\n\n`)
            );
          }
        }

        controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              message:
                error instanceof Error
                  ? error.message
                  : "Unable to stream Otto welcome."
            })}\n\n`
          )
        );
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream"
    }
  });
}
