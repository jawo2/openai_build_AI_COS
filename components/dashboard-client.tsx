"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OttoWorkspace } from "@/components/otto-workspace";
import type {
  AnalyzeResponse,
  Insight,
  Platform,
  Recommendation,
  RecentPost
} from "@/lib/types";

type StreamEvent = {
  event: string;
  data: string;
};

export function DashboardClient() {
  const searchParams = useSearchParams();
  const platform = parsePlatform(searchParams.get("platform"));
  const handle = searchParams.get("handle") || (platform === "tiktok" ? "_offo" : "_offo98");
  const [status, setStatus] = useState(firstStatus(platform));
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeRecommendation, setActiveRecommendation] = useState<Recommendation | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    async function analyze() {
      setResult(null);
      setError(null);
      setStatus(firstStatus(platform));

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ platform, handle }),
          signal: abortController.signal
        });

        if (!response.ok || !response.body) {
          throw new Error("Unable to start analysis.");
        }

        await readEventStream(response.body, (streamEvent) => {
          const payload = JSON.parse(streamEvent.data);

          if (streamEvent.event === "status") {
            setStatus(payload.message);
          }

          if (streamEvent.event === "warning") {
            setStatus(payload.message);
          }

          if (streamEvent.event === "error") {
            setError(payload.message);
          }

          if (streamEvent.event === "result") {
            setResult(payload);
            setStatus("Ready");
          }
        });
      } catch (caughtError) {
        if (!abortController.signal.aborted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to analyze this creator."
          );
        }
      }
    }

    analyze();

    return () => abortController.abort();
  }, [handle, platform]);

  const creator = result?.creator;
  const analysis = result?.analysis;
  const recommendations = useMemo(() => analysis?.recommendations ?? [], [analysis]);
  const selectedRecommendation = activeRecommendation ?? recommendations[0] ?? null;
  const thumbnails = useMemo(
    () => creator?.recentPosts.filter((post) => post.thumbnailUrl).slice(0, 3) ?? [],
    [creator]
  );
  const breakoutPost = useMemo(
    () => creator?.recentPosts.find((post) => post.isBreakout) ?? null,
    [creator]
  );

  useEffect(() => {
    if (recommendations.length === 0) {
      setActiveRecommendation(null);
      return;
    }

    setActiveRecommendation((currentRecommendation) => {
      const stillExists = recommendations.some(
        (recommendation) => recommendation.title === currentRecommendation?.title
      );

      return stillExists ? currentRecommendation : recommendations[0];
    });
  }, [recommendations]);

  if (!result || !creator || !analysis) {
    return (
      <main className="min-h-screen bg-paper px-6 py-7 text-ink sm:px-10">
        <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-5xl flex-col">
          <DashboardNav />
          <LoadingState platform={platform} status={status} error={error} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-5">
        <DashboardNav />

        <CreatorSnapshot creator={creator} dataSource={result.dataSource} />

        <section className="rounded-lg border border-ink/10 bg-white p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-signal">Today</p>
              <h1 className="text-3xl font-semibold tracking-tight">
                Today&apos;s Priorities
              </h1>
            </div>
            <span className="text-sm text-ink/50">{creator.engagementTrend}</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {analysis.priorities.map((priority) => (
              <article
                className="rounded-lg border border-ink/10 bg-paper p-4"
                key={priority.title}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-signal">
                    {priority.agentSource}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-ink/60">
                    {priority.urgency}
                  </span>
                </div>
                <h2 className="mt-4 text-lg font-semibold tracking-tight">
                  {priority.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink/62">{priority.summary}</p>
              </article>
            ))}
          </div>
        </section>

        {creator.platform === "tiktok" ? (
          <TikTokSpotlight creatorAvgViews={creator.avgViews} breakoutPost={breakoutPost} />
        ) : null}

        <section className="grid gap-5 lg:grid-cols-[minmax(260px,28%)_1fr]">
          <ActionCenter
            recommendations={recommendations}
            selectedRecommendation={selectedRecommendation}
            onSelect={setActiveRecommendation}
          />
          <OttoWorkspace creator={creator} selectedRecommendation={selectedRecommendation} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <div className="rounded-lg border border-ink/10 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold tracking-tight">Insights</h2>
              <span className="text-sm text-ink/45">{analysis.insights.length} signals</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {analysis.insights.map((insight) => (
                <InsightCard insight={insight} key={`${insight.metric}-${insight.trend}`} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-ink/10 bg-white p-4">
            <h2 className="text-xl font-semibold tracking-tight">Referenced posts</h2>
            <div className="mt-4 grid gap-3">
              {thumbnails.length > 0 ? (
                thumbnails.map((post) => <PostThumbnail key={post.timestamp} post={post} />)
              ) : (
                <p className="text-sm leading-6 text-ink/55">
                  No public thumbnails were returned for this scrape.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const event = parseStreamEvent(chunk);

      if (event) {
        onEvent(event);
      }
    }
  }
}

function parseStreamEvent(chunk: string): StreamEvent | null {
  const event = chunk.match(/^event: (.+)$/m)?.[1];
  const data = chunk.match(/^data: (.+)$/m)?.[1];

  return event && data ? { event, data } : null;
}

function LoadingState({
  error,
  platform,
  status
}: {
  error: string | null;
  platform: Platform;
  status: string;
}) {
  const steps = [firstStatus(platform), analyzingStatus(platform), "Otto is thinking..."];

  return (
    <section className="flex flex-1 items-center justify-center py-16">
      <div className="landing-rise w-full max-w-2xl rounded-lg border border-ink/10 bg-white p-6 shadow-[0_24px_70px_rgba(17,17,17,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal">
          Otto is preparing your brief
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">
          {error ?? status}
        </h1>
        <div className="mt-8 grid gap-3">
          {steps.map((step) => {
            const isActive = step === status;
            const isDone = steps.indexOf(step) < steps.indexOf(status);

            return (
              <div
                className={`flex items-center gap-3 rounded-md border px-4 py-3 ${
                  isActive
                    ? "border-signal/40 bg-signal/[0.08]"
                    : isDone
                      ? "border-moss/20 bg-moss/[0.08]"
                      : "border-ink/10 bg-paper"
                }`}
                key={step}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isActive ? "bg-signal" : isDone ? "bg-moss" : "bg-ink/18"
                  }`}
                />
                <span className="text-sm font-medium text-ink/70">{step}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DashboardNav({ compact = false }: { compact?: boolean }) {
  return (
    <nav className="flex items-center justify-between">
      <a className="text-xl font-semibold tracking-tight" href="/">
        Otto
      </a>
      {!compact ? (
        <a className="text-sm font-medium text-ink/50 hover:text-ink" href="/">
          New profile
        </a>
      ) : null}
    </nav>
  );
}

function CreatorSnapshot({
  creator,
  dataSource
}: {
  creator: AnalyzeResponse["creator"];
  dataSource: AnalyzeResponse["dataSource"];
}) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar creator={creator} />
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-signal">
              Creator Snapshot
            </p>
            <h1 className="truncate text-3xl font-semibold tracking-tight">
              @{creator.handle}
            </h1>
            <p className="text-sm capitalize text-ink/50">{creator.platform}</p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[640px] lg:grid-cols-4">
          <div className="flex items-center rounded-md bg-paper p-3">
            {dataSource === "live" ? (
              <LiveBadge platform={creator.platform} />
            ) : (
              <span className="w-fit rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink/58">
                {dataSource} data
              </span>
            )}
          </div>
          <Metric label="Followers" value={formatNumber(creator.followerCount)} />
          <Metric label="Engagement" value={`${creator.engagementRate}%`} />
          {creator.platform === "tiktok" ? (
            <Metric label="Avg views" value={formatNumber(creator.avgViews ?? 0)} />
          ) : (
            <Metric label="Trend" value={creator.engagementTrend} />
          )}
        </div>
      </div>
    </section>
  );
}

function Avatar({ creator }: { creator: AnalyzeResponse["creator"] }) {
  if (creator.avatarUrl) {
    return (
      <img
        alt={`@${creator.handle}`}
        className="h-14 w-14 rounded-full border border-ink/10 object-cover"
        src={creator.avatarUrl}
      />
    );
  }

  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-ink/10 bg-paper text-sm font-semibold uppercase text-ink/45">
      {creator.platform.slice(0, 2)}
    </div>
  );
}

function LiveBadge({ platform }: { platform: Platform }) {
  return (
    <span className="flex w-fit items-center gap-2 rounded-full bg-moss px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white">
      <PlatformIcon platform={platform} />
      Live data - scraped just now
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-paper p-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink/42">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function TikTokSpotlight({
  breakoutPost,
  creatorAvgViews
}: {
  breakoutPost: RecentPost | null;
  creatorAvgViews: number | null;
}) {
  if (!breakoutPost) {
    return null;
  }

  return (
    <section className="grid gap-4 rounded-lg border border-ink/10 bg-ink p-5 text-white md:grid-cols-[1fr_280px]">
      <div>
        <p className="text-sm font-semibold text-white/56">TikTok breakout</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">
          {formatNumber(breakoutPost.views ?? 0)} views
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68">
          This video is above the profile average of {formatNumber(creatorAvgViews ?? 0)} views
          and is the clearest proof point for the growth story.
        </p>
      </div>
      <PostThumbnail dark post={breakoutPost} />
    </section>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article className="rounded-lg bg-paper p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink/70">{insight.metric}</p>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-moss">
          {insight.trend}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink/62">{insight.interpretation}</p>
    </article>
  );
}

function PostThumbnail({ dark = false, post }: { dark?: boolean; post: RecentPost }) {
  return (
    <article
      className={`grid grid-cols-[76px_1fr] gap-3 rounded-md ${
        dark ? "bg-white/8 p-2" : "bg-paper p-2"
      }`}
    >
      {post.thumbnailUrl ? (
        <img
          alt=""
          className="h-[92px] w-[76px] rounded-[6px] object-cover"
          src={post.thumbnailUrl}
        />
      ) : (
        <div className="h-[92px] w-[76px] rounded-[6px] bg-ink/10" />
      )}
      <div className="min-w-0 py-1">
        <p className={`line-clamp-2 text-sm font-medium ${dark ? "text-white" : "text-ink"}`}>
          {post.caption || post.postType}
        </p>
        <p className={`mt-2 text-xs ${dark ? "text-white/56" : "text-ink/50"}`}>
          {post.views !== null ? `${formatNumber(post.views)} views · ` : ""}
          {post.engagementRate}% engagement
        </p>
      </div>
    </article>
  );
}

function ActionCenter({
  onSelect,
  recommendations,
  selectedRecommendation
}: {
  onSelect: (recommendation: Recommendation) => void;
  recommendations: Recommendation[];
  selectedRecommendation: Recommendation | null;
}) {
  return (
    <aside className="landing-rise self-start overflow-hidden rounded-lg border border-ink/10 bg-white">
      <div className="border-b border-ink/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Action Center</h2>
          <span className="rounded bg-paper px-2 py-1 text-xs font-semibold text-ink/50">
            {recommendations.length}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-ink/50">
          Prioritized missions generated from the creator brief.
        </p>
      </div>

      <div className="bg-paper/70 p-2">
        {recommendations.map((recommendation, index) => {
          const isSelected = selectedRecommendation?.title === recommendation.title;
          const mission = getMissionDisplay(recommendation, index);

          return (
            <button
              className={`mb-2 grid w-full gap-3 rounded-md border p-3 text-left transition last:mb-0 ${
                isSelected
                  ? "border-ink bg-white shadow-[0_10px_24px_rgba(17,17,17,0.08)]"
                  : "border-ink/10 bg-white/70 hover:border-ink/18 hover:bg-white"
              }`}
              key={recommendation.title}
              onClick={() => onSelect(recommendation)}
              type="button"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        mission.priority === "High"
                          ? "bg-signal"
                          : mission.priority === "Medium"
                            ? "bg-moss"
                            : "bg-ink/28"
                      }`}
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/45">
                      {mission.category}
                    </span>
                  </span>
                  <span className="mt-2 block text-sm font-semibold leading-5 tracking-tight text-ink">
                    {recommendation.title}
                  </span>
                </span>
                <span className="rounded border border-ink/10 bg-paper px-2 py-1 text-[11px] font-semibold text-ink/55">
                  {mission.priority}
                </span>
              </span>

              <span className="grid gap-2 text-[11px] sm:grid-cols-2">
                <MissionMeta label="Impact" value={mission.expectedImpact} />
                <MissionMeta label="Confidence" value={mission.confidenceScore} />
                <MissionMeta label="Effort" value={mission.estimatedEffort} />
                <MissionMeta label="Priority" value={mission.priority} />
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function MissionMeta({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center justify-between gap-2 rounded bg-paper px-2 py-1.5">
      <span className="font-medium text-ink/40">{label}</span>
      <span className="truncate font-semibold text-ink/68">{value}</span>
    </span>
  );
}

function getMissionDisplay(recommendation: Recommendation, index: number) {
  const priority = index === 0 ? "High" : index === 1 ? "Medium" : "Low";
  const confidenceBase = 78 + Math.min(recommendation.supportingMetrics.length, 4) * 4;
  const confidenceScore = `${Math.min(confidenceBase + recommendation.reasoning.length, 96)}%`;
  const expectedImpact =
    recommendation.supportingMetrics[0]?.trend || recommendation.supportingMetrics[0]?.value || "Qualified lift";
  const estimatedEffort =
    recommendation.actionType === "pricing"
      ? "Medium"
      : recommendation.actionType === "outreach"
        ? "Low"
        : "Medium";

  return {
    category: formatActionCategory(recommendation.actionType),
    confidenceScore,
    estimatedEffort,
    expectedImpact,
    priority
  };
}

function formatActionCategory(actionType: Recommendation["actionType"]) {
  if (actionType === "outreach") {
    return "Partnerships";
  }

  if (actionType === "content") {
    return "Content";
  }

  return "Pricing";
}

function PlatformIcon({ platform }: { platform: Platform }) {
  return <span className="text-[11px]">{platform === "tiktok" ? "TT" : "IG"}</span>;
}

function parsePlatform(value: string | null): Platform {
  return value === "instagram" ? "instagram" : "tiktok";
}

function firstStatus(platform: Platform) {
  return platform === "tiktok"
    ? "Fetching your TikTok profile..."
    : "Fetching your Instagram profile...";
}

function analyzingStatus(platform: Platform) {
  return platform === "tiktok"
    ? "Analyzing 12 recent videos..."
    : "Analyzing 12 recent posts...";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0
  }).format(value);
}
