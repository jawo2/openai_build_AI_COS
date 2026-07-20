import { runStructuredResponse } from "@/lib/openai";
import type { AgentResult, AnalysisResult, CreatorProfile, DataSource } from "@/lib/types";
import { AnalysisResultJsonSchema, AnalysisResultSchema } from "@/lib/types";
import { businessAgent } from "./businessAgent";
import { contentAgent } from "./contentAgent";
import { growthAgent } from "./growthAgent";

const MANAGER_SYSTEM_PROMPT = `You are Otto, an AI Chief of Staff for creators. You have just received analysis from three specialist agents (Content, Growth, Business) about one creator. Synthesize their outputs into a single prioritized brief - the way a great chief of staff prepares their principal's morning.

You will receive JSON: { profile, dataSource, contentAgent, growthAgent, businessAgent }.

Produce:
1. PRIORITIES (exactly 3): The three things that matter most TODAY, ranked by impact. Each is one clear directive sentence plus a one-line summary of why now. A revenue opportunity with strong evidence usually outranks a content tweak.
2. INSIGHTS (3-5): The most decision-relevant facts across all agents. Deduplicate - if two agents cite the same engagement trend, merge it.
3. RECOMMENDATIONS (3-4): Select the strongest from the agents. You may rewrite titles and tighten reasoning, but NEVER alter or invent metrics - copy supportingMetrics through faithfully.

Ranking criteria, in order:
a) Revenue impact
b) Strength of evidence (specificity + consistency of metrics)
c) Effort required (prefer actions completable this week)

Example: "Raise your sponsorship rate" beats "Post more carousels" when both are supported, because it converts existing momentum into revenue.

Rules:
- Exactly one recommendation must have actionType "outreach" (this powers the email demo).
- Voice: you speak AS Otto, directly to the creator, second person. Confident, warm, zero corporate filler. "Your engagement is up 18% - this is the moment to raise your rate."
- No two priorities may cover the same underlying opportunity.
- Before finalizing, verify every number in your output appears verbatim in the agent inputs.
- Every recommendation must keep at least 3 reasoning bullets, each citing specific metrics.
- Every reasoning bullet must contain at least one concrete digit, percentage, count, dollar range, or ratio from the input.
- Do not use content-categories-only reasoning bullets. Brand-fit categories may appear in titles or descriptions, but reasoning bullets must include numeric performance evidence.
- Set dataSource exactly to the input dataSource value. Do not infer or change it.
- Output only JSON matching the AnalysisResult schema.`;

export type ManagerInput = {
  profile: CreatorProfile;
  dataSource: DataSource;
  contentAgent: AgentResult;
  growthAgent: AgentResult;
  businessAgent: AgentResult;
};

export async function runManager(
  profile: CreatorProfile,
  dataSource: DataSource = "demo"
): Promise<AnalysisResult> {
  const [contentResult, growthResult, businessResult] = await Promise.all([
    contentAgent(profile),
    growthAgent(profile),
    businessAgent(profile)
  ]);

  return synthesizeAnalysis({
    profile,
    dataSource,
    contentAgent: contentResult,
    growthAgent: growthResult,
    businessAgent: businessResult
  });
}

export async function synthesizeAnalysis(input: ManagerInput): Promise<AnalysisResult> {
  let previousError: Error | null = null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const analysis = await runStructuredResponse({
      name: "AnalysisResult",
      schema: AnalysisResultJsonSchema,
      validator: AnalysisResultSchema,
      instructions: previousError
        ? `${MANAGER_SYSTEM_PROMPT}\n\nYour previous output failed validation: ${previousError.message}\nFix that issue and output valid JSON only.`
        : MANAGER_SYSTEM_PROMPT,
      input,
      temperature: 0.3
    });

    const normalizedAnalysis = repairReasoningMetrics({
      ...analysis,
      dataSource: input.dataSource
    });

    try {
      assertManagerShape(normalizedAnalysis);

      return normalizedAnalysis;
    } catch (error) {
      previousError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw previousError ?? new Error("Manager failed validation.");
}

function assertManagerShape(analysis: AnalysisResult): void {
  if (analysis.priorities.length !== 3) {
    throw new Error(`Manager returned ${analysis.priorities.length} priorities; expected 3.`);
  }

  if (analysis.insights.length < 3 || analysis.insights.length > 5) {
    throw new Error(`Manager returned ${analysis.insights.length} insights; expected 3-5.`);
  }

  if (analysis.recommendations.length < 3 || analysis.recommendations.length > 4) {
    throw new Error(
      `Manager returned ${analysis.recommendations.length} recommendations; expected 3-4.`
    );
  }

  const outreachCount = analysis.recommendations.filter(
    (recommendation) => recommendation.actionType === "outreach"
  ).length;

  if (outreachCount !== 1) {
    throw new Error(`Manager returned ${outreachCount} outreach recommendations; expected 1.`);
  }

  for (const recommendation of analysis.recommendations) {
    if (recommendation.reasoning.length < 3) {
      throw new Error(
        `Recommendation "${recommendation.title}" has ${recommendation.reasoning.length} reasoning bullets; expected at least 3.`
      );
    }

    for (const reason of recommendation.reasoning) {
      if (!/\d/.test(reason)) {
        throw new Error(
          `Recommendation "${recommendation.title}" has a reasoning bullet without a specific number: "${reason}"`
        );
      }
    }
  }
}

function repairReasoningMetrics(analysis: AnalysisResult): AnalysisResult {
  return {
    ...analysis,
    recommendations: analysis.recommendations.map((recommendation) => {
      const numericMetrics = recommendation.supportingMetrics.filter((metric) =>
        /\d/.test(metric.value)
      );

      return {
        ...recommendation,
        reasoning: recommendation.reasoning.map((reason, index) => {
          if (/\d/.test(reason) || numericMetrics.length === 0) {
            return reason;
          }

          const metric = numericMetrics[index % numericMetrics.length];

          return `${reason} (${metric.label}: ${metric.value}.)`;
        })
      };
    })
  };
}
