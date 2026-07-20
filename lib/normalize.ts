import type { CreatorProfile, PostType, RecentPost } from "@/lib/types";

const POST_LIMIT = 12;
const SPONSORSHIP_PATTERN = /#ad\b|#sponsored\b|paid partnership/i;

type RawRecord = Record<string, unknown>;

export function normalizeTikTok(raw: unknown): CreatorProfile {
  const items = recordsFrom(raw)
    .sort((a, b) => timestampMs(b) - timestampMs(a))
    .slice(0, POST_LIMIT);
  const authorMeta = recordFrom(items[0]?.authorMeta);
  const handle = stringFrom(authorMeta?.name) ?? stringFrom(items[0]?.author) ?? "";
  const followerCount = numberFrom(authorMeta?.fans) ?? 0;
  const avgViews = meanNullable(items.map((item) => numberFrom(item.playCount)));

  const recentPosts = items.map((item) => {
    const videoMeta = recordFrom(item.videoMeta);
    const views = numberFrom(item.playCount);
    const likes = numberFrom(item.diggCount) ?? 0;
    const comments = numberFrom(item.commentCount) ?? 0;
    const shares = numberFrom(item.shareCount);
    const caption = stringFrom(item.text) ?? "";

    return {
      views,
      likes,
      comments,
      shares,
      timestamp:
        stringFrom(item.createTimeISO) ??
        timestampFromUnix(numberFrom(item.createTime)) ??
        new Date().toISOString(),
      postType: "video",
      caption,
      isSponsored: hasSponsorSignal(caption),
      thumbnailUrl: stringFrom(videoMeta?.coverUrl) ?? stringFrom(videoMeta?.originalCoverUrl),
      engagementRate: calculateViewEngagementRate(likes, comments, shares, views),
      isBreakout: avgViews !== null && views !== null && views > avgViews * 2
    } satisfies RecentPost;
  });

  return {
    platform: "tiktok",
    handle,
    avatarUrl:
      stringFrom(authorMeta?.avatar) ??
      stringFrom(authorMeta?.avatarLarger) ??
      stringFrom(authorMeta?.avatarMedium) ??
      null,
    followerCount,
    avgViews,
    engagementRate: mean(recentPosts.map((post) => post.engagementRate)),
    engagementTrend: formatTrend(recentPosts.map((post) => post.engagementRate)),
    contentCategories: inferContentCategories(items, recentPosts, ["short-form video"]),
    estimatedMetrics: false,
    recentPosts
  };
}

export function normalizeInstagram(profile: unknown, posts: unknown): CreatorProfile {
  const profileRecord = recordFrom(profile) ?? {};
  const items = recordsFrom(posts)
    .sort((a, b) => timestampMs(b) - timestampMs(a))
    .slice(0, POST_LIMIT);
  const followerCount = numberFrom(profileRecord.followersCount) ?? 0;

  const recentPosts = items.map((item) => {
    const likes = numberFrom(item.likesCount) ?? 0;
    const comments = numberFrom(item.commentsCount) ?? 0;
    const caption = stringFrom(item.caption) ?? "";

    return {
      views: null,
      likes,
      comments,
      shares: null,
      timestamp: stringFrom(item.timestamp) ?? new Date().toISOString(),
      postType: instagramPostType(item),
      caption,
      isSponsored: hasSponsorSignal(caption),
      thumbnailUrl:
        stringFrom(item.displayUrl) ??
        stringFrom(item.thumbnailUrl) ??
        firstString(item.images),
      engagementRate: calculateFollowerEngagementRate(likes, comments, followerCount),
      isBreakout: false
    } satisfies RecentPost;
  });

  return {
    platform: "instagram",
    handle: stringFrom(profileRecord.username) ?? "",
    avatarUrl:
      stringFrom(profileRecord.profilePicUrl) ??
      stringFrom(profileRecord.profilePicUrlHD) ??
      stringFrom(profileRecord.profilePicUrlHd) ??
      null,
    followerCount,
    avgViews: null,
    engagementRate: mean(recentPosts.map((post) => post.engagementRate)),
    engagementTrend: formatTrend(recentPosts.map((post) => post.engagementRate)),
    contentCategories: inferContentCategories(items, recentPosts, ["instagram posts"]),
    estimatedMetrics: true,
    recentPosts
  };
}

function calculateViewEngagementRate(
  likes: number,
  comments: number,
  shares: number | null,
  views: number | null
): number {
  if (!views || views <= 0) {
    return 0;
  }

  return roundPercent((likes + comments + (shares ?? 0)) / views);
}

function calculateFollowerEngagementRate(
  likes: number,
  comments: number,
  followerCount: number
): number {
  if (followerCount <= 0) {
    return 0;
  }

  return roundPercent((likes + comments) / followerCount);
}

function formatTrend(values: number[]): string {
  const recent = values.slice(0, 6);
  const prior = values.slice(6, 12);

  if (recent.length === 0 || prior.length === 0) {
    return "insufficient prior posts for trend";
  }

  const recentAvg = mean(recent);
  const priorAvg = mean(prior);

  if (priorAvg === 0) {
    return recentAvg > 0 ? "up from 0% prior average" : "flat at 0%";
  }

  const delta = ((recentAvg - priorAvg) / priorAvg) * 100;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  return `${direction} ${Math.abs(delta).toFixed(1)}% vs prior 6 posts`;
}

function inferContentCategories(
  rawPosts: RawRecord[],
  normalizedPosts: RecentPost[],
  fallback: string[]
): string[] {
  const hashtags = rawPosts.flatMap((post) => extractHashtags(post.hashtags));
  const captionTags = normalizedPosts.flatMap((post) => extractCaptionSignals(post.caption));
  const categories = Array.from(new Set([...hashtags, ...captionTags]))
    .map((category) => category.toLowerCase())
    .filter(Boolean)
    .slice(0, 8);

  return categories.length > 0 ? categories : fallback;
}

function extractHashtags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((hashtag) => {
      if (typeof hashtag === "string") {
        return hashtag;
      }

      return stringFrom(recordFrom(hashtag)?.name);
    })
    .filter((hashtag): hashtag is string => typeof hashtag === "string")
    .map(cleanCategory);
}

function extractCaptionSignals(caption: string): string[] {
  const hashtagMatches = caption.match(/#[A-Za-z0-9_À-ÿ]+/g) ?? [];
  const keywordMatches: Array<[string, RegExp]> = [
    ["dance", /\bdance|baile|bail/i],
    ["acting", /\bacting|actor|actuaci/i],
    ["lifestyle", /\blifestyle|fit|look|daily/i],
    ["brand collaborations", /\bbrand|collab|sponsored|partnership|#ad\b/i]
  ];

  return [
    ...hashtagMatches.map(cleanCategory),
    ...keywordMatches
      .filter(([, pattern]) => pattern.test(caption))
      .map(([category]) => category)
  ];
}

function instagramPostType(item: RawRecord): PostType {
  const type = `${stringFrom(item.type) ?? ""} ${stringFrom(item.productType) ?? ""}`
    .toLowerCase()
    .trim();

  if (type.includes("clips") || type.includes("reel")) {
    return "reel";
  }

  if (type.includes("sidecar") || type.includes("carousel")) {
    return "carousel";
  }

  if (type.includes("video")) {
    return "video";
  }

  return "image";
}

function hasSponsorSignal(caption: string): boolean {
  return SPONSORSHIP_PATTERN.test(caption);
}

function recordsFrom(value: unknown): RawRecord[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is RawRecord => isRecord(item));
  }

  const record = recordFrom(value);
  const items = record?.items;

  return Array.isArray(items)
    ? items.filter((item): item is RawRecord => isRecord(item))
    : [];
}

function recordFrom(value: unknown): RawRecord | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is RawRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numberFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function firstString(value: unknown): string | null {
  return Array.isArray(value) ? value.find((item) => typeof item === "string") ?? null : null;
}

function timestampMs(item: RawRecord): number {
  const timestamp =
    stringFrom(item.createTimeISO) ??
    timestampFromUnix(numberFrom(item.createTime)) ??
    stringFrom(item.timestamp);

  return timestamp ? new Date(timestamp).getTime() || 0 : 0;
}

function timestampFromUnix(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(2));
}

function meanNullable(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => typeof value === "number");

  if (numbers.length === 0) {
    return null;
  }

  return Math.round(numbers.reduce((total, value) => total + value, 0) / numbers.length);
}

function roundPercent(value: number): number {
  return Number((value * 100).toFixed(2));
}

function cleanCategory(value: string): string {
  return value.replace(/^#/, "").trim();
}
