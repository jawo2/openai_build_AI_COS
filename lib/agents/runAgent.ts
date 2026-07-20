import { runStructuredResponse } from "@/lib/openai";
import type { AgentResult, CreatorProfile } from "@/lib/types";
import { AgentResultJsonSchema, AgentResultSchema } from "@/lib/types";

export async function runAgent(
  name: string,
  systemPrompt: string,
  profile: CreatorProfile
): Promise<AgentResult> {
  return runStructuredResponse({
    name,
    schema: AgentResultJsonSchema,
    validator: AgentResultSchema,
    instructions: systemPrompt,
    input: {
      profile,
      requirements: {
        minimumReasoningBulletsPerRecommendation: 3,
        reasoningMustReferenceSpecificProfileMetrics: true,
        outputShape: "{ insights, recommendations }"
      }
    },
    temperature: 0.4
  });
}
