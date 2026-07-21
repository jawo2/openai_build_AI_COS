import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { AnalysisResult, CreatorProfile, Platform } from "@/lib/types";
import { AnalysisResultSchema, CreatorProfileSchema } from "@/lib/types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_DIR = path.join(process.cwd(), ".cache");

export type CachedCreatorProfile = {
  profile: CreatorProfile;
  timestamp: string;
};

export type CachedAnalysisResult = {
  analysis: AnalysisResult;
  profileHash: string;
  timestamp: string;
};

export function cacheKey(platform: Platform, handle: string): string {
  return `${platform}:${handle.toLowerCase()}`;
}

export async function readCachedProfile(
  platform: Platform,
  handle: string,
  options: { ignoreTtl?: boolean } = {}
): Promise<CachedCreatorProfile | null> {
  try {
    const raw = await readFile(cachePath(platform, handle), "utf8");
    const parsed = JSON.parse(raw) as CachedCreatorProfile;
    const profile = CreatorProfileSchema.parse(parsed.profile);
    const cached = {
      profile,
      timestamp: parsed.timestamp
    };

    if (!options.ignoreTtl && isExpired(cached.timestamp)) {
      return null;
    }

    return cached;
  } catch {
    return null;
  }
}

export async function writeCachedProfile(
  platform: Platform,
  handle: string,
  profile: CreatorProfile
): Promise<CachedCreatorProfile> {
  const cached = {
    profile,
    timestamp: new Date().toISOString()
  };

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath(platform, handle), JSON.stringify(cached, null, 2), "utf8");

  return cached;
}

export async function readCachedAnalysis(
  platform: Platform,
  handle: string,
  profile: CreatorProfile
): Promise<CachedAnalysisResult | null> {
  try {
    const raw = await readFile(analysisCachePath(platform, handle), "utf8");
    const parsed = JSON.parse(raw) as CachedAnalysisResult;

    if (parsed.profileHash !== profileHash(profile)) {
      return null;
    }

    return {
      analysis: AnalysisResultSchema.parse(parsed.analysis),
      profileHash: parsed.profileHash,
      timestamp: parsed.timestamp
    };
  } catch {
    return null;
  }
}

export async function writeCachedAnalysis(
  platform: Platform,
  handle: string,
  profile: CreatorProfile,
  analysis: AnalysisResult
): Promise<CachedAnalysisResult> {
  const cached = {
    analysis,
    profileHash: profileHash(profile),
    timestamp: new Date().toISOString()
  };

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(analysisCachePath(platform, handle), JSON.stringify(cached, null, 2), "utf8");

  return cached;
}

function cachePath(platform: Platform, handle: string): string {
  return path.join(CACHE_DIR, `${cacheKey(platform, handle).replace(":", "__")}.json`);
}

function analysisCachePath(platform: Platform, handle: string): string {
  return path.join(CACHE_DIR, `${cacheKey(platform, handle).replace(":", "__")}__analysis.json`);
}

function profileHash(profile: CreatorProfile): string {
  return createHash("sha256").update(JSON.stringify(profile)).digest("hex");
}

function isExpired(timestamp: string): boolean {
  const createdAt = new Date(timestamp).getTime();

  if (!Number.isFinite(createdAt)) {
    return true;
  }

  return Date.now() - createdAt > CACHE_TTL_MS;
}
