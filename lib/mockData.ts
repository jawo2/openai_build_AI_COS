import type { CreatorProfile, Platform, RecentPost } from "@/lib/types";

const tiktokViews = [
  240000, 22000, 21000, 20000, 19000, 18000, 15000, 14000, 13000, 12000, 11000, 11000
];

const tiktokPosts: RecentPost[] = tiktokViews.map((views, index) => {
  const isSponsored = index === 1 || index === 4;
  const likes = isSponsored ? Math.round(views * 0.105) : Math.round(views * 0.072);
  const comments = isSponsored ? Math.round(views * 0.006) : Math.round(views * 0.004);
  const shares = isSponsored ? Math.round(views * 0.011) : Math.round(views * 0.006);
  const engagementRate = Number((((likes + comments + shares) / views) * 100).toFixed(2));

  return {
    views,
    likes,
    comments,
    shares,
    timestamp: daysAgo(index),
    postType: "video",
    caption: isSponsored
      ? `Partner interval training routine #fitness #sponsored #ad`
      : `Strength circuit day ${index + 1} #fitness #workout #gym`,
    isSponsored,
    thumbnailUrl: null,
    postUrl: null,
    engagementRate,
    isBreakout: views > 36000
  };
});

const instagramPosts: RecentPost[] = [
  [8200, 420, 31, "carousel", "Weekly glute program #fitness #strength"],
  [7900, 402, 28, "reel", "Meal prep reset #nutrition #fitness"],
  [7600, 390, 25, "image", "Morning mobility #wellness"],
  [7300, 374, 22, "reel", "Dumbbell-only circuit #workout"],
  [7100, 360, 21, "carousel", "Protein snacks I actually use #nutrition"],
  [6900, 344, 20, "image", "Recovery day walk #wellness"],
  [6400, 305, 18, "reel", "Core finisher #fitness"],
  [6200, 294, 17, "carousel", "Beginner gym split #gym"],
  [6000, 282, 16, "image", "Hydration check #wellness"],
  [5800, 270, 15, "reel", "Lower body burn #workout"],
  [5600, 260, 14, "carousel", "Grocery haul #nutrition"],
  [5400, 250, 13, "image", "Rest day reminder #fitness"]
].map(([reach, likes, comments, postType, caption], index) => ({
  views: null,
  likes: likes as number,
  comments: comments as number,
  shares: null,
  timestamp: daysAgo(index),
  postType: postType as RecentPost["postType"],
  caption: caption as string,
  isSponsored: false,
  thumbnailUrl: null,
  postUrl: null,
  engagementRate: Number(((((likes as number) + (comments as number)) / 85000) * 100).toFixed(2)),
  isBreakout: false
}));

export const mockProfiles: Record<Platform, CreatorProfile> = {
  tiktok: {
    platform: "tiktok",
    handle: "fitmara",
    avatarUrl: null,
    followerCount: 120000,
    avgViews: 18000,
    engagementRate: 9.84,
    engagementTrend: "up 18.0% vs prior 6 posts",
    contentCategories: ["fitness", "workout", "gym", "nutrition", "strength"],
    estimatedMetrics: false,
    recentPosts: tiktokPosts
  },
  instagram: {
    platform: "instagram",
    handle: "fitmara.coach",
    avatarUrl: null,
    followerCount: 85000,
    avgViews: null,
    engagementRate: 0.42,
    engagementTrend: "up 16.4% vs prior 6 posts",
    contentCategories: ["fitness", "strength", "nutrition", "wellness", "workout"],
    estimatedMetrics: true,
    recentPosts: instagramPosts
  }
};

export function getMockProfile(platform: Platform): CreatorProfile {
  return mockProfiles[platform];
}

function daysAgo(days: number): string {
  const date = new Date("2026-07-20T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() - days);

  return date.toISOString();
}
