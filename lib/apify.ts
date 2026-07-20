import { ApifyClient } from "apify-client";
import { normalizeInstagram, normalizeTikTok } from "@/lib/normalize";
import type { CreatorProfile, Platform } from "@/lib/types";

const APIFY_TIMEOUT_SECONDS = 90;
const RECENT_POST_LIMIT = 12;
const TIKTOK_ACTOR_ID = "clockworks/tiktok-scraper";
const INSTAGRAM_ACTOR_ID = "apify/instagram-scraper";

type ApifyRecord = Record<string, unknown>;

export class PrivateAccountError extends Error {
  constructor(message = "This creator profile is private.") {
    super(message);
    this.name = "PrivateAccountError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Creator profile was not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class TimeoutError extends Error {
  constructor(message = "Scraping timed out after 90 seconds.") {
    super(message);
    this.name = "TimeoutError";
  }
}

export class RateLimitError extends Error {
  constructor(message = "Apify or the target platform rate limited the scrape.") {
    super(message);
    this.name = "RateLimitError";
  }
}

export async function scrapeProfile(
  platform: Platform,
  handle: string
): Promise<CreatorProfile> {
  const cleanHandle = normalizeHandle(handle);

  if (platform === "tiktok") {
    return scrapeTikTokProfile(cleanHandle);
  }

  return scrapeInstagramProfile(cleanHandle);
}

async function scrapeTikTokProfile(handle: string): Promise<CreatorProfile> {
  const items = await runActor(TIKTOK_ACTOR_ID, {
    profiles: [handle],
    resultsPerPage: RECENT_POST_LIMIT,
    profileScrapeSections: ["videos"],
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadAvatars: false
  });

  if (items.length === 0) {
    throw new NotFoundError(`No TikTok results found for @${handle}.`);
  }

  const authorMeta = asRecord(items[0].authorMeta);

  if (authorMeta?.privateAccount === true) {
    throw new PrivateAccountError(`TikTok profile @${handle} is private.`);
  }

  const profile = normalizeTikTok(items);

  return {
    ...profile,
    handle: profile.handle || handle
  };
}

async function scrapeInstagramProfile(handle: string): Promise<CreatorProfile> {
  const directUrls = [toInstagramProfileUrl(handle)];
  const [profileItems, postItems] = await Promise.all([
    runActor(INSTAGRAM_ACTOR_ID, {
      directUrls,
      resultsType: "details",
      resultsLimit: 1,
      addProfileStatistics: true
    }),
    runActor(INSTAGRAM_ACTOR_ID, {
      directUrls,
      resultsType: "posts",
      resultsLimit: RECENT_POST_LIMIT,
      addParentData: true
    })
  ]);

  const profile = profileItems[0];

  if (!profile) {
    throw new NotFoundError(`No Instagram profile details found for @${handle}.`);
  }

  if (profile.private === true || profile.isPrivate === true) {
    throw new PrivateAccountError(`Instagram profile @${handle} is private.`);
  }

  const normalizedProfile = normalizeInstagram(profile, postItems);

  return {
    ...normalizedProfile,
    handle: normalizedProfile.handle || handle
  };
}

async function runActor(
  actorId: typeof TIKTOK_ACTOR_ID | typeof INSTAGRAM_ACTOR_ID,
  input: Record<string, unknown>
): Promise<ApifyRecord[]> {
  const token = process.env.APIFY_API_TOKEN;

  if (!token) {
    throw new Error("Missing APIFY_API_TOKEN environment variable.");
  }

  const client = new ApifyClient({ token });

  try {
    const run = await withTimeout(
      client.actor(actorId).call(input, {
        waitSecs: APIFY_TIMEOUT_SECONDS,
        timeout: APIFY_TIMEOUT_SECONDS
      })
    );

    if (run.status === "TIMED-OUT") {
      throw new TimeoutError(`Apify actor ${actorId} timed out.`);
    }

    if (run.status !== "SUCCEEDED") {
      throw classifyApifyError(
        new Error(`Apify actor ${actorId} finished with status ${run.status}.`)
      );
    }

    if (!run.defaultDatasetId) {
      throw new NotFoundError(`Apify actor ${actorId} did not return a dataset.`);
    }

    const dataset = await client.dataset(run.defaultDatasetId).listItems({
      limit: RECENT_POST_LIMIT + 5
    });

    return dataset.items as ApifyRecord[];
  } catch (error) {
    throw classifyApifyError(error);
  }
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError());
    }, APIFY_TIMEOUT_SECONDS * 1000);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function classifyApifyError(error: unknown): Error {
  if (
    error instanceof PrivateAccountError ||
    error instanceof NotFoundError ||
    error instanceof TimeoutError ||
    error instanceof RateLimitError
  ) {
    return error;
  }

  const message = getErrorMessage(error);
  const lowerMessage = message.toLowerCase();
  const statusCode = numberFrom(asRecord(error)?.statusCode);

  if (statusCode === 429 || lowerMessage.includes("rate limit") || lowerMessage.includes("too many requests")) {
    return new RateLimitError(message);
  }

  if (lowerMessage.includes("private")) {
    return new PrivateAccountError(message);
  }

  if (statusCode === 404 || lowerMessage.includes("not found") || lowerMessage.includes("does not exist")) {
    return new NotFoundError(message);
  }

  if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
    return new TimeoutError(message);
  }

  return error instanceof Error ? error : new Error(message);
}

function normalizeHandle(handle: string): string {
  return handle
    .trim()
    .replace(/^https?:\/\/(www\.)?(instagram\.com|tiktok\.com)\//i, "")
    .replace(/^@/, "")
    .replace(/\/$/, "")
    .split("/")
    .filter(Boolean)[0];
}

function toInstagramProfileUrl(handle: string): string {
  return `https://www.instagram.com/${handle}/`;
}

function asRecord(value: unknown): ApifyRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ApifyRecord)
    : null;
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown Apify scraping error.";
}
