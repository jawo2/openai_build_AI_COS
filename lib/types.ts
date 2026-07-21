import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const PlatformSchema = z.enum(["tiktok", "instagram"]);
export const PostTypeSchema = z.enum(["video", "reel", "carousel", "image"]);
export const ActionTypeSchema = z.enum(["outreach", "content", "pricing"]);
export const DataSourceSchema = z.enum(["live", "cached", "demo"]);

export const RecentPostSchema = z
  .object({
    views: z.number().int().nonnegative().nullable(),
    likes: z.number().int().nonnegative(),
    comments: z.number().int().nonnegative(),
    shares: z.number().int().nonnegative().nullable(),
    timestamp: z.string(),
    postType: PostTypeSchema,
    caption: z.string(),
    isSponsored: z.boolean(),
    thumbnailUrl: z.string().url().nullable(),
    postUrl: z.string().url().nullable().optional(),
    engagementRate: z.number().nonnegative(),
    isBreakout: z.boolean()
  })
  .strict();

export const CreatorProfileSchema = z
  .object({
    platform: PlatformSchema,
    handle: z.string().min(1),
    avatarUrl: z.string().url().nullable(),
    followerCount: z.number().int().nonnegative(),
    avgViews: z.number().nonnegative().nullable(),
    engagementRate: z.number().nonnegative(),
    engagementTrend: z.string(),
    contentCategories: z.array(z.string()).min(1),
    estimatedMetrics: z.boolean(),
    recentPosts: z.array(RecentPostSchema)
  })
  .strict();

export const PrioritySchema = z
  .object({
    title: z.string().min(1),
    urgency: z.string().min(1),
    agentSource: z.string().min(1),
    summary: z.string().min(1)
  })
  .strict();

export const InsightSchema = z
  .object({
    metric: z.string().min(1),
    trend: z.string().min(1),
    interpretation: z.string().min(1)
  })
  .strict();

export const SupportingMetricSchema = z
  .object({
    label: z.string().min(1),
    value: z.string().min(1),
    trend: z.string().min(1)
  })
  .strict();

export const RecommendationSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    reasoning: z.array(z.string().min(1)).min(3),
    supportingMetrics: z.array(SupportingMetricSchema).min(1),
    actionType: ActionTypeSchema
  })
  .strict();

export const AnalysisResultSchema = z
  .object({
    priorities: z.array(PrioritySchema),
    insights: z.array(InsightSchema),
    recommendations: z.array(RecommendationSchema),
    dataSource: DataSourceSchema
  })
  .strict();

export const AgentResultSchema = z
  .object({
    insights: z.array(InsightSchema),
    recommendations: z.array(RecommendationSchema)
  })
  .strict();

export const EmailDraftSchema = z
  .object({
    subject: z.string().min(1),
    body: z.string().min(1)
  })
  .strict();

const jsonSchemaOptions = {
  target: "jsonSchema7" as const
};

export const CreatorProfileJsonSchema = zodToJsonSchema(CreatorProfileSchema, {
  ...jsonSchemaOptions,
  name: "CreatorProfile"
});

export const PriorityJsonSchema = zodToJsonSchema(PrioritySchema, {
  ...jsonSchemaOptions,
  name: "Priority"
});

export const InsightJsonSchema = zodToJsonSchema(InsightSchema, {
  ...jsonSchemaOptions,
  name: "Insight"
});

export const RecommendationJsonSchema = zodToJsonSchema(RecommendationSchema, {
  ...jsonSchemaOptions,
  name: "Recommendation"
});

export const AnalysisResultJsonSchema = zodToJsonSchema(AnalysisResultSchema, {
  ...jsonSchemaOptions,
  name: "AnalysisResult"
});

export const AgentResultJsonSchema = zodToJsonSchema(AgentResultSchema, {
  ...jsonSchemaOptions,
  name: "AgentResult"
});

export const EmailDraftJsonSchema = zodToJsonSchema(EmailDraftSchema, {
  ...jsonSchemaOptions,
  name: "EmailDraft"
});

export type Platform = z.infer<typeof PlatformSchema>;
export type PostType = z.infer<typeof PostTypeSchema>;
export type ActionType = z.infer<typeof ActionTypeSchema>;
export type DataSource = z.infer<typeof DataSourceSchema>;
export type RecentPost = z.infer<typeof RecentPostSchema>;
export type CreatorProfile = z.infer<typeof CreatorProfileSchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type Insight = z.infer<typeof InsightSchema>;
export type SupportingMetric = z.infer<typeof SupportingMetricSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type AgentResult = z.infer<typeof AgentResultSchema>;
export type EmailDraft = z.infer<typeof EmailDraftSchema>;

export type AnalyzeRequest = {
  handle?: string;
  profileUrl?: string;
  platform: Platform;
};

export type AnalyzeResponse = {
  creator: CreatorProfile;
  analysis: AnalysisResult;
  dataSource: DataSource;
};

export type GenerateEmailRequest = {
  profile: CreatorProfile;
  recommendation: Recommendation;
};

export type GenerateEmailResponse = EmailDraft;
