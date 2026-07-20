import type { AnalysisResult, CreatorProfile } from "@/lib/types";

export const demoCreatorProfile: CreatorProfile = {
  platform: "instagram",
  handle: "_offo98",
  avatarUrl: null,
  followerCount: 10000,
  avgViews: 18600,
  engagementRate: 6.8,
  engagementTrend: "up 18% over the last 30 days",
  contentCategories: ["dance", "acting", "lifestyle", "brand collaborations"],
  estimatedMetrics: true,
  recentPosts: [
    {
      views: 24200,
      likes: 1800,
      comments: 96,
      shares: 120,
      timestamp: "2026-07-12T18:30:00.000Z",
      postType: "reel",
      caption: "Dance rehearsal with a branded transition.",
      isSponsored: true,
      thumbnailUrl: null,
      engagementRate: 8.34,
      isBreakout: false
    },
    {
      views: 17100,
      likes: 1210,
      comments: 64,
      shares: 82,
      timestamp: "2026-07-09T20:15:00.000Z",
      postType: "reel",
      caption: "Behind the scenes from set.",
      isSponsored: false,
      thumbnailUrl: null,
      engagementRate: 7.93,
      isBreakout: false
    }
  ]
};

export const demoAnalysisResult: AnalysisResult = {
  dataSource: "demo",
  priorities: [
    {
      title: "Raise sponsorship pricing",
      urgency: "High",
      agentSource: "Business Agent",
      summary:
        "Sponsored content is outperforming baseline engagement, giving you leverage before the next brand conversation."
    },
    {
      title: "Repeat the strongest dance format",
      urgency: "High",
      agentSource: "Content Agent",
      summary:
        "Short, performance-led videos are the clearest content pattern to convert into a repeatable series."
    },
    {
      title: "Pitch food and retail brands",
      urgency: "Medium",
      agentSource: "Growth Agent",
      summary:
        "Existing collaborations create a credible lane for restaurant and retail partnerships."
    }
  ],
  insights: [
    {
      metric: "Engagement rate",
      trend: "up 18%",
      interpretation:
        "Audience response is strengthening, especially on posts that combine performance and brand context."
    },
    {
      metric: "Sponsored post performance",
      trend: "above baseline",
      interpretation:
        "Brand integrations are not hurting content quality, which supports stronger pricing."
    }
  ],
  recommendations: [
    {
      title: "Increase your sponsorship starting rate",
      description:
        "Update the rate card and use recent sponsored performance as proof in the next outreach conversation.",
      reasoning: [
        "Recent sponsored content is outperforming baseline engagement.",
        "The audience sits in a clear consumer segment for food, retail, and lifestyle brands.",
        "Past collaborations provide proof that the creator can integrate brands naturally."
      ],
      supportingMetrics: [
        {
          label: "Engagement trend",
          value: "+18%",
          trend: "up"
        },
        {
          label: "Average views",
          value: "18.6K",
          trend: "stable"
        },
        {
          label: "Sponsored post signal",
          value: "above average",
          trend: "up"
        }
      ],
      actionType: "pricing"
    }
  ]
};
