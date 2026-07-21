"use client";

/* eslint-disable @next/next/no-img-element */

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  AnalysisResult,
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

type ActiveTab = "dashboard" | "outreach" | "content" | "pricing";

type MissionDisplay = {
  category: string;
  confidenceScore: string;
  estimatedEffort: string;
  expectedImpact: string;
  priority: "High" | "Medium" | "Low";
};

type WeeklyGoalMetric = {
  benchmark: string;
  benchmarkBasis: string;
  currentValue: string;
  explanation: string;
  label: string;
  status: "green" | "yellow" | "red";
  weekOverWeek: string;
};

type WeeklyGoalReport = {
  goal: string;
  metrics: WeeklyGoalMetric[];
  opportunity: string;
};

type BrandChatMessage = {
  email?: {
    body: string;
    subject: string;
  } | null;
  role: "user" | "otto";
  text: string;
};

type ContentPlanDraft = {
  caption: string;
  concept: string;
  hook: string;
  script: string;
};

type ContentChatMessage = {
  plan?: ContentPlanDraft | null;
  role: "user" | "otto";
  text: string;
};

type PricingRateRow = {
  label: string;
  value: string;
};

type PricingChatMessage = {
  note?: string | null;
  rates?: PricingRateRow[] | null;
  role: "user" | "otto";
  text: string;
};

export function DashboardClient() {
  const searchParams = useSearchParams();
  const platform = parsePlatform(searchParams.get("platform"));
  const handle = searchParams.get("handle") || (platform === "tiktok" ? "_offo" : "_offo98");
  const [status, setStatus] = useState(firstStatus(platform));
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeRecommendation, setActiveRecommendation] = useState<Recommendation | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");

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

          if (streamEvent.event === "status" || streamEvent.event === "warning") {
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
  const selectedRecommendation =
    activeRecommendation ??
    getRecommendationForTab(recommendations, activeTab) ??
    recommendations[0] ??
    null;
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

  useEffect(() => {
    setActiveRecommendation(getRecommendationForTab(recommendations, activeTab) ?? recommendations[0] ?? null);
  }, [activeTab, recommendations]);

  if (!result || !creator || !analysis) {
    return (
      <main className="min-h-screen bg-paper text-ink">
        <div className="flex min-h-screen flex-col">
          <DashboardNav activeTab="dashboard" />
          <div className="flex w-full flex-1 px-[58px] py-5">
            <LoadingState platform={platform} status={status} error={error} />
          </div>
        </div>
      </main>
    );
  }

  const showSpotlight = activeTab === "dashboard" && creator.platform === "tiktok";

  return (
    <main className="h-screen overflow-hidden bg-paper text-ink">
      <DashboardNav activeTab={activeTab} onTabChange={setActiveTab} />

      <div
        className={`grid h-[calc(100vh-56px)] gap-3 overflow-hidden px-[58px] py-3 ${
          showSpotlight ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[minmax(0,1fr)]"
        }`}
      >
        {showSpotlight ? (
          <TikTokSpotlight
            analyzedVideoCount={creator.recentPosts.length}
            creatorAvgViews={creator.avgViews}
            breakoutPost={breakoutPost}
          />
        ) : null}

        {activeTab === "dashboard" ? (
          <DashboardTab
            analysis={analysis}
            creator={creator}
            dataSource={result.dataSource}
            onTabChange={setActiveTab}
          />
        ) : null}

        {activeTab === "outreach" ? (
          <BrandPipelineTab
            creator={creator}
            recommendation={getRecommendationForTab(recommendations, "outreach") ?? selectedRecommendation}
          />
        ) : null}

        {activeTab === "content" ? (
          <ContentStudioTab
            breakoutPost={breakoutPost}
            creator={creator}
            recommendation={getRecommendationForTab(recommendations, "content") ?? selectedRecommendation}
          />
        ) : null}

        {activeTab === "pricing" ? (
          <PricingTab
            creator={creator}
            recommendation={getRecommendationForTab(recommendations, "pricing") ?? selectedRecommendation}
          />
        ) : null}
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
      <div className="landing-rise w-full max-w-2xl rounded-[8px] border border-ink/10 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-signal">
          Otto is preparing your brief
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          {error ?? status}
        </h1>
        <div className="mt-8 grid gap-2">
          {steps.map((step) => {
            const isActive = step === status;
            const isDone = steps.indexOf(step) < steps.indexOf(status);

            return (
              <div
                className={`flex items-center gap-3 rounded-[6px] border px-4 py-3 ${
                  isActive
                    ? "border-signal/40 bg-signal/[0.08]"
                    : isDone
                      ? "border-moss/20 bg-moss/[0.08]"
                      : "border-ink/10 bg-stone"
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

function DashboardNav({
  activeTab,
  onTabChange
}: {
  activeTab: ActiveTab;
  onTabChange?: (tab: ActiveTab) => void;
}) {
  const tabs: Array<{ count?: number; icon: string; id: ActiveTab; label: string }> = [
    { icon: "▦", id: "dashboard", label: "Dashboard" },
    { count: 3, icon: "✉", id: "outreach", label: "Brand pipeline" },
    { icon: "▻", id: "content", label: "Content studio" },
    { icon: "$", id: "pricing", label: "Pricing" }
  ];

  return (
    <header className="sticky top-0 z-10 flex h-[56px] w-full items-center gap-5 border-b border-ink/10 bg-white px-[32px]">
      <a className="shrink-0 text-[30px] font-semibold leading-none tracking-tight" href="/">
        O
      </a>

      <nav className="flex min-w-0 flex-1 items-stretch justify-start gap-[30px] self-stretch pl-[58px]">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;

          return (
            <button
              className={`flex h-full shrink-0 items-center gap-2 border-b-2 text-sm font-semibold transition ${
                active
                  ? "border-signal text-ink"
                  : "border-transparent text-ink/58 hover:text-ink"
              }`}
              key={tab.id}
              onClick={() => onTabChange?.(tab.id)}
              type="button"
            >
              <span className="text-[12px] text-current">{tab.icon}</span>
              {tab.label}
              {tab.count ? (
                <span className="rounded-full bg-stone px-2 py-0.5 text-xs text-ink/35">
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <label className="mr-[26px] hidden h-9 w-[188px] shrink-0 items-center gap-2 rounded-full border border-ink/10 px-4 text-sm font-medium text-ink/35 md:flex">
        <span>Ask something</span>
        <span className="ml-auto text-xs text-ink">⌕</span>
      </label>
    </header>
  );
}

function DashboardTab({
  analysis,
  creator,
  dataSource,
  onTabChange
}: {
  analysis: AnalysisResult;
  creator: AnalyzeResponse["creator"];
  dataSource: AnalyzeResponse["dataSource"];
  onTabChange: (tab: ActiveTab) => void;
}) {
  return (
    <section className="grid min-h-0 gap-3 lg:grid-cols-[1fr_2fr]">
      <CreatorSnapshot
        creator={creator}
        dataSource={dataSource}
        goalRecommendation={analysis.recommendations[0] ?? null}
      />
      <PrioritiesPanel recommendations={analysis.recommendations} onTabChange={onTabChange} />
    </section>
  );
}
function BrandPipelineTab({
  creator,
  recommendation
}: {
  creator: AnalyzeResponse["creator"];
  recommendation: Recommendation | null;
}) {
  const defaultBrand = getBrandName(recommendation);
  const [selectedBrand, setSelectedBrand] = useState(defaultBrand);

  useEffect(() => {
    setSelectedBrand(defaultBrand);
  }, [defaultBrand]);

  return (
    <section className="grid min-h-0 gap-3 lg:grid-cols-[1fr_2fr]">
      <BrandContextPanel
        creator={creator}
        recommendation={recommendation}
        selectedBrand={selectedBrand}
        onBrandChange={setSelectedBrand}
      />
      <BrandPipelinePanel
        creator={creator}
        recommendation={recommendation}
        selectedBrand={selectedBrand}
        onBrandChange={setSelectedBrand}
      />
    </section>
  );
}

function ContentStudioTab({
  breakoutPost,
  creator,
  recommendation
}: {
  breakoutPost: RecentPost | null;
  creator: AnalyzeResponse["creator"];
  recommendation: Recommendation | null;
}) {
  return (
    <section className="grid min-h-0 gap-3 lg:grid-cols-[1fr_2fr]">
      <ContentContextPanel breakoutPost={breakoutPost} creator={creator} recommendation={recommendation} />
      <ContentStudioPanel
        breakoutPost={breakoutPost}
        creator={creator}
        recommendation={recommendation}
      />
    </section>
  );
}

function PricingTab({
  creator,
  recommendation
}: {
  creator: AnalyzeResponse["creator"];
  recommendation: Recommendation | null;
}) {
  return (
    <section className="grid min-h-0 gap-3 lg:grid-cols-[1fr_2fr]">
      <PricingContextPanel creator={creator} />
      <PricingPanel creator={creator} recommendation={recommendation} />
    </section>
  );
}

function PrioritiesPanel({
  onTabChange,
  recommendations
}: {
  onTabChange: (tab: ActiveTab) => void;
  recommendations: Recommendation[];
}) {
  return (
    <section className="min-h-0 overflow-hidden rounded-[8px] border border-ink/10 bg-white p-4">
      <h1 className="text-[28px] font-semibold leading-8 tracking-tight">
        Today&apos;s Top Priorities
      </h1>
      <div className="mt-4">
        {recommendations.map((recommendation, index) => {
          const mission = getMissionDisplay(recommendation, index);

          return (
            <article className="border-t border-ink/10 py-4" key={recommendation.title}>
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {recommendation.title}
                  </h2>
                  <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-ink/58">
                    {recommendation.description}
                  </p>
                  <button
                    className="mt-1 text-left text-sm text-ink/50 transition hover:text-ink"
                    onClick={() => onTabChange(getTabForActionType(recommendation.actionType))}
                    type="button"
                  >
                    Start →
                  </button>
                </div>
                <span className="shrink-0 rounded-full bg-stone px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink">
                  {mission.priority}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CreatorSnapshot({
  creator,
  dataSource,
  goalRecommendation
}: {
  creator: AnalyzeResponse["creator"];
  dataSource: AnalyzeResponse["dataSource"];
  goalRecommendation: Recommendation | null;
}) {
  const report = getWeeklyGoalReport(creator, goalRecommendation, dataSource);

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[8px] border border-ink/10 bg-white p-4">
      <div className="flex items-start gap-3">
        <Avatar creator={creator} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">@{creator.handle}</h1>
          <p className="text-sm capitalize text-ink/50">{creator.platform}</p>
          <p className="truncate text-sm capitalize text-ink/50">
            {formatCompactNumber(creator.followerCount)} followers
            {creator.contentCategories[0] ? ` | ${creator.contentCategories[0]}` : ""}
          </p>
        </div>
        <span className="ml-auto mt-1 w-fit shrink-0 rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink">
          Weekly status
        </span>
      </div>

      <div className="mt-3 grid flex-1 content-between gap-2">
        <GoalCard report={report} />
        {report.metrics.map((metric) => (
          <GoalMetricCard key={metric.label} metric={metric} />
        ))}
      </div>
    </section>
  );
}

function GoalCard({ report }: { report: WeeklyGoalReport }) {
  return (
    <article className="rounded-[6px] bg-stone px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink">This week&apos;s focus</p>
      <h2 className="mt-1 text-base font-semibold leading-5 tracking-tight">{report.goal}</h2>
      <p className="mt-1 text-xs leading-5 text-ink/52">
        Best next move: {report.opportunity}
      </p>
    </article>
  );
}

function GoalMetricCard({ metric }: { metric: WeeklyGoalMetric }) {
  return (
    <article className="rounded-[6px] bg-stone px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink">
          {metric.label}
        </p>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <p
          className={`text-xl font-semibold tracking-tight ${
            metric.status === "green"
              ? "text-moss"
              : metric.status === "yellow"
                ? "text-[#9b7625]"
                : "text-signal"
          }`}
        >
          {metric.currentValue}
        </p>
        <span className="group relative inline-flex">
          <button
            aria-label={`${metric.label} healthy target information`}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-ink/15 bg-white text-[11px] font-semibold text-ink/48 transition hover:border-ink/30 hover:text-ink focus:outline-none focus:ring-2 focus:ring-signal/30"
            type="button"
          >
            i
          </button>
          <span className="pointer-events-none absolute bottom-7 left-full z-20 ml-2 hidden w-[300px] rounded-[6px] border border-ink/10 bg-white p-3 text-xs font-medium leading-5 text-ink/62 shadow-[0_12px_34px_rgba(17,17,17,0.14)] group-hover:block group-focus-within:block">
            Healthy target: <span className="font-semibold text-ink">{metric.benchmark}</span>
            <br />
            {metric.benchmarkBasis}
          </span>
        </span>
      </div>
      <p className="mt-0.5 text-xs font-semibold text-ink/56">
        {metric.weekOverWeek}
      </p>
      <p className="mt-0.5 text-xs leading-5 text-ink/62">
        {metric.explanation}
      </p>
    </article>
  );
}

function getWeeklyGoalReport(
  creator: AnalyzeResponse["creator"],
  recommendation: Recommendation | null,
  dataSource: AnalyzeResponse["dataSource"]
): WeeklyGoalReport {
  const market = inferCreatorMarket(creator);
  const niche = creator.contentCategories[0] ?? "creator";
  const opportunity =
    recommendation?.title ??
    (creator.platform === "tiktok"
      ? "make more videos like the one people watched most"
      : "turn your most-liked posts into a simple brand pitch");
  const goal =
    recommendation?.actionType === "outreach"
      ? "Use your strongest post this week to pitch one brand."
      : recommendation?.actionType === "pricing"
        ? "Use this week’s numbers to set a fair sponsored-post price."
        : "Make more of the content your audience already proved they want.";

  const engagementBenchmark = getEngagementBenchmark(market, niche, creator.platform);
  const currentEngagement = creator.engagementRate;
  const engagementPrevious = getPreviousValue(currentEngagement, getTrendPercent(creator.engagementTrend));
  const engagementAbsChange = currentEngagement - engagementPrevious;

  const metrics: WeeklyGoalMetric[] = [
    {
      benchmark: `${engagementBenchmark.value}%`,
      benchmarkBasis: engagementBenchmark.basis,
      currentValue: `${roundMetric(currentEngagement)}%`,
      explanation:
        "This tells you if people are liking and commenting enough to make this idea worth repeating.",
      label: "People reacting",
      status: getHealthStatus(currentEngagement, engagementBenchmark.value),
      weekOverWeek: formatWeekOverWeek(engagementAbsChange, currentEngagement, "pt")
    }
  ];

  if (creator.platform === "tiktok") {
    const avgViews = creator.avgViews ?? mean(creator.recentPosts.map((post) => post.views ?? 0));
    const viewsBenchmark = getViewsBenchmark(creator, market, niche);
    const viewsPrevious = getPreviousValue(avgViews, getTrendPercent(creator.engagementTrend));
    const breakoutPost = creator.recentPosts.find((post) => post.isBreakout);
    const breakoutMultiplier = breakoutPost?.views && avgViews > 0 ? breakoutPost.views / avgViews : null;

    metrics.push({
      benchmark: formatCompactNumber(viewsBenchmark.value),
      benchmarkBasis: viewsBenchmark.basis,
      currentValue: formatCompactNumber(avgViews),
      explanation:
        "This tells you how many people your usual video reaches, so you know if the idea can grow.",
      label: "Views per video",
      status: getHealthStatus(avgViews, viewsBenchmark.value),
      weekOverWeek: formatWeekOverWeek(avgViews - viewsPrevious, avgViews, "views")
    });

    if (breakoutMultiplier !== null) {
      metrics.push({
        benchmark: "2x average",
        benchmarkBasis:
          "A video that gets twice your normal views is a clear sign that people want more of that style.",
        currentValue: `${roundMetric(breakoutMultiplier)}x avg`,
        explanation:
          "This shows whether your best video was meaningfully better than your usual videos.",
        label: "Best video vs normal",
        status: getHealthStatus(breakoutMultiplier, 2),
        weekOverWeek:
          dataSource === "live"
            ? "Measured from current scrape"
            : `Measured from ${dataSource} profile data`
      });
    }
  } else {
    const interactionRateBenchmark = getInteractionBenchmark(market, niche);
    const avgInteractionRate = mean(
      creator.recentPosts.map((post) =>
        creator.followerCount > 0
          ? ((post.likes + post.comments) / creator.followerCount) * 100
          : 0
      )
    );
    const interactionPrevious = getPreviousValue(avgInteractionRate, getTrendPercent(creator.engagementTrend));

    metrics.push({
      benchmark: `${interactionRateBenchmark.value}%`,
      benchmarkBasis: interactionRateBenchmark.basis,
      currentValue: `${roundMetric(avgInteractionRate)}%`,
      explanation:
        "This tells you if people are actively liking and commenting on your posts.",
      label: "People interacting",
      status: getHealthStatus(avgInteractionRate, interactionRateBenchmark.value),
      weekOverWeek: formatWeekOverWeek(avgInteractionRate - interactionPrevious, avgInteractionRate, "pt")
    });
  }

  return {
    goal,
    metrics,
    opportunity
  };
}

function inferCreatorMarket(creator: AnalyzeResponse["creator"]) {
  const text = [creator.handle, ...creator.contentCategories, ...creator.recentPosts.map((post) => post.caption)]
    .join(" ")
    .toLowerCase();

  if (
    text.includes("lima") ||
    text.includes("piura") ||
    text.includes("peru") ||
    text.includes("latam")
  ) {
    return "Peru / LatAm";
  }

  return "US / general market";
}

function getEngagementBenchmark(market: string, niche: string, platform: Platform) {
  const nicheText = niche.toLowerCase();
  const isLatAm = market.includes("LatAm");
  const isDanceOrFitness = nicheText.includes("dance") || nicheText.includes("fitness");
  const value = platform === "tiktok"
    ? isLatAm && isDanceOrFitness
      ? 5.8
      : 4.5
    : isLatAm && isDanceOrFitness
      ? 3.2
      : 2.5;

  return {
    basis: `For ${market} creators making ${niche || "similar"} ${platform} content, around ${value}% means people are responding well.`,
    value
  };
}

function getViewsBenchmark(
  creator: AnalyzeResponse["creator"],
  market: string,
  niche: string
) {
  const ratio = market.includes("LatAm") ? 0.1 : 0.08;
  const value = Math.max(1000, Math.round(creator.followerCount * ratio));

  return {
    basis: `For ${market} short videos in this niche, a healthy video usually reaches about ${Math.round(ratio * 100)}% of followers.`,
    value
  };
}

function getInteractionBenchmark(market: string, niche: string) {
  const value = market.includes("LatAm") ? 2.8 : 2.2;

  return {
    basis: `For ${market} Instagram posts in this niche, about ${value}% likes and comments is a healthy response.`,
    value
  };
}

function getHealthStatus(current: number, benchmark: number): WeeklyGoalMetric["status"] {
  const tolerance = Math.max(Math.abs(benchmark) * 0.001, 0.001);

  if (current > benchmark + tolerance) {
    return "green";
  }

  if (Math.abs(current - benchmark) <= tolerance) {
    return "yellow";
  }

  return "red";
}

function getTrendPercent(trend: string) {
  const matched = trend.match(/[-+]?\d+(\.\d+)?/);

  return matched ? Number(matched[0]) : 0;
}

function getPreviousValue(current: number, trendPercent: number) {
  if (!Number.isFinite(current) || trendPercent === 0) {
    return current;
  }

  return current / (1 + trendPercent / 100);
}

function formatWeekOverWeek(change: number, current: number, unit: "pt" | "views") {
  const previous = current - change;
  const percentChange = previous === 0 ? 0 : (change / previous) * 100;
  const sign = change >= 0 ? "+" : "";
  const formattedChange =
    unit === "views"
      ? `${sign}${formatCompactNumber(Math.round(change))}`
      : `${sign}${roundMetric(change)} points`;

  return `${formattedChange} since last week (${sign}${roundMetric(percentChange)}%)`;
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
    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-ink/10 bg-[#e8eeee] text-sm font-semibold uppercase text-ink/70">
      o
    </div>
  );
}

function BrandContextPanel({
  creator,
  onBrandChange,
  recommendation,
  selectedBrand
}: {
  creator: AnalyzeResponse["creator"];
  onBrandChange: (brand: string) => void;
  recommendation: Recommendation | null;
  selectedBrand: string;
}) {
  const brandOptions = getBrandOptions(recommendation);

  return (
    <SidePanel contentClassName="flex h-full flex-col">
      <div className="flex items-start gap-3">
        <Avatar creator={creator} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">@{creator.handle}</h1>
          <p className="text-sm text-ink/50">{formatPlatformName(creator.platform)}</p>
          <p className="truncate text-sm text-ink/50">
            {formatCompactNumber(creator.followerCount)} followers
          </p>
        </div>
        <span className="ml-auto mt-1 w-fit shrink-0 rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink">
          Recommendations
        </span>
      </div>

      <div className="mt-[34px] flex flex-1 flex-col justify-between gap-6 pb-14">
        <SoftBlock eyebrow="Top niche">
          <p className="text-base font-semibold leading-5 tracking-tight">
            {creator.contentCategories.slice(0, 3).join(", ") || "Lifestyle, travel and creator"}
            {" "}content perform best for you.
          </p>
          <p className="mt-1 text-xs leading-5 text-ink/52">
            Use these themes as proof points when pitching brands.
          </p>
        </SoftBlock>
        <SoftBlock eyebrow="Brand size">
          <p className="text-base font-semibold leading-5 tracking-tight">Mid-size & global brands</p>
          <p className="mt-1 text-xs leading-5 text-ink/52">
            Your {creator.engagementRate}% engagement supports this tier
          </p>
        </SoftBlock>
        <SoftBlock eyebrow="Top matches to research">
          <div className="flex flex-col items-start gap-2">
            {brandOptions.map((brand) => (
              <BrandChip
                active={brand === selectedBrand}
                key={brand}
                onClick={() => onBrandChange(brand)}
              >
                {brand}
              </BrandChip>
            ))}
          </div>
        </SoftBlock>
        <SoftBlock eyebrow="Campaign pricing">
          <p className="text-xl font-semibold tracking-tight">S/ 520-650</p>
          <p className="text-xs leading-5 text-ink/52">
            per dedicated video, 27% above regional benchmark
          </p>
        </SoftBlock>
      </div>
    </SidePanel>
  );
}

function BrandPipelinePanel({
  creator,
  onBrandChange,
  recommendation,
  selectedBrand
}: {
  creator: AnalyzeResponse["creator"];
  onBrandChange: (brand: string) => void;
  recommendation: Recommendation | null;
  selectedBrand: string;
}) {
  const metric = recommendation?.supportingMetrics[0];
  const emailDraft = buildBrandEmailDraft({
    brand: selectedBrand,
    creator,
    metric
  });
  const currentEmail = `${emailDraft.subject}\n\n${emailDraft.body}`;

  const [brandMessages, setBrandMessages] = useState<BrandChatMessage[]>([]);
  const [isBrandChatSending, setIsBrandChatSending] = useState(false);

  useEffect(() => {
    setBrandMessages([]);
    setIsBrandChatSending(false);
  }, [selectedBrand]);

  async function handleBrandChatSubmit(message: string) {
    const trimmedMessage = message.trim();
    const requestedBrand = detectRequestedBrand(trimmedMessage);
    const nextBrand = requestedBrand ?? selectedBrand;

    if (!trimmedMessage || !recommendation || isBrandChatSending) {
      return;
    }

    if (requestedBrand && requestedBrand !== selectedBrand) {
      onBrandChange(requestedBrand);
      setIsBrandChatSending(false);
      return;
    }

    setBrandMessages((messages) => [
      ...messages,
      { role: "user", text: trimmedMessage }
    ]);
    setIsBrandChatSending(true);

    try {
      const response = await fetch("/api/brand-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          currentEmail:
            requestedBrand
              ? formatBrandEmailText(buildBrandEmailDraft({
                  brand: nextBrand,
                  creator,
                  metric
                }))
              : currentEmail,
          message: trimmedMessage,
          profile: creator,
          recommendation
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to send this message.");
      }

      setBrandMessages((messages) => [
        ...messages,
        {
          email: payload.email ?? null,
          role: "otto",
          text: payload.reply ?? "I can help refine this outreach from here."
        }
      ]);
    } catch (error) {
      setBrandMessages((messages) => [
        ...messages,
        {
          role: "otto",
          text:
            error instanceof Error
              ? error.message
              : "I could not process that request just now."
        }
      ]);
    } finally {
      setIsBrandChatSending(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[8px] border border-ink/10 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-signal">
        Opportunity
      </p>
      <h1 className="mt-1 text-[28px] font-semibold leading-8 tracking-tight">{selectedBrand}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/58">
        “Your strongest pitch is already visible in the data. I drafted the email so the outreach starts from proof, not a blank page.”
      </p>

      <div className="mt-4 flex-1 overflow-y-auto border-t border-ink/10 pt-4 pr-2">
        <EmailDraftBlock body={emailDraft.body} subject={emailDraft.subject} />
        {brandMessages.length > 0 ? (
          <div className="mt-4 grid gap-3 border-t border-ink/10 pt-4">
          {brandMessages.map((message, index) => (
            <div className="grid gap-3" key={`${message.role}-${index}`}>
              <div
                className={`rounded-[6px] px-3 py-2 text-sm leading-5 ${
                  message.role === "user"
                    ? "ml-auto max-w-[78%] bg-ink text-white"
                    : "mr-auto max-w-[82%] bg-stone text-ink/70"
                }`}
              >
                {message.text}
              </div>
              {message.role === "otto" && message.email ? (
                <EmailDraftBlock body={message.email.body} subject={message.email.subject} />
              ) : null}
            </div>
          ))}
          </div>
        ) : null}
      </div>
      <PromptBar
        className="mt-3"
        disabled={!recommendation || isBrandChatSending}
        onSubmit={handleBrandChatSubmit}
        placeholder={
          isBrandChatSending
            ? "Otto is thinking..."
            : "Ask something — e.g. switch to Adidas, make it shorter"
        }
      />
    </section>
  );
}

function ContentContextPanel({
  breakoutPost,
  creator,
  recommendation
}: {
  breakoutPost: RecentPost | null;
  creator: AnalyzeResponse["creator"];
  recommendation: Recommendation | null;
}) {
  return (
    <SidePanel contentClassName="flex h-full flex-col">
      <ProfileMini creator={creator} />
      <div className="mt-4 grid items-start gap-3">
        <PillLabel>Content insights</PillLabel>
        <SoftBlock eyebrow="What worked">
          <p className="text-base font-semibold leading-5 tracking-tight">
            {recommendation?.supportingMetrics[0]?.label ?? "Personal storytelling"}, up from the prior average.
          </p>
        </SoftBlock>
        <SoftBlock eyebrow="Reference video">
          <div className="flex items-center gap-3 rounded-[8px] border border-ink/10 bg-white px-2 py-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-[#18383a] text-white">
              ▶
            </span>
            <p className="text-sm font-semibold leading-5">
              {breakoutPost ? "Breakout post" : "Reference post"} — watch on {formatPlatformName(creator.platform)}
            </p>
          </div>
        </SoftBlock>
      </div>
      <div className="mt-9 grid items-start gap-3">
        <PillLabel>Trending now</PillLabel>
        <SoftBlock eyebrow="Worth riding">
          <p className="text-base font-semibold leading-5 tracking-tight">
            World Cup buzz, “Waka Waka” resurgence
          </p>
          <p className="mt-1 text-xs leading-5 text-ink/52">Close to your niche — #MundialTikTok, #LimaPeru</p>
        </SoftBlock>
      </div>
    </SidePanel>
  );
}

function ContentStudioPanel({
  breakoutPost,
  creator,
  recommendation
}: {
  breakoutPost: RecentPost | null;
  creator: AnalyzeResponse["creator"];
  recommendation: Recommendation | null;
}) {
  const initialPlan = useMemo<ContentPlanDraft>(
    () => ({
      caption: `“${breakoutPost?.caption?.slice(0, 92) || "another Lima celebration I had to show you"}”`,
      concept:
        "Continue the strongest storytelling style, tied to a timely local culture moment.",
      hook:
        "Open on a local celebration already happening near you, then narrate your own connection to it.",
      script:
        "0:00-0:03 — Handheld shot walking into the celebration, no cuts.\n0:03-0:10 — Narrate why this moment matters to you.\n0:10-0:20 — Show 2-3 quick moments, natural sound, no music yet.\n0:20-0:25 — Land on a closing line, cut to black."
    }),
    [breakoutPost]
  );
  const [contentMessages, setContentMessages] = useState<ContentChatMessage[]>([]);
  const [currentPlan, setCurrentPlan] = useState(initialPlan);
  const [isContentSending, setIsContentSending] = useState(false);
  const currentPlanText = formatContentPlanText(currentPlan);

  useEffect(() => {
    setCurrentPlan(initialPlan);
    setContentMessages([]);
  }, [initialPlan]);

  async function handleContentSubmit(message: string) {
    const trimmedMessage = message.trim();

    if (!trimmedMessage || isContentSending) {
      return;
    }

    setContentMessages((messages) => [
      ...messages,
      { role: "user", text: trimmedMessage }
    ]);
    setIsContentSending(true);

    try {
      const response = await fetch("/api/content-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          currentPlan: currentPlanText,
          message: trimmedMessage,
          profile: creator,
          recommendation
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to refine this plan.");
      }

      if (payload.plan) {
        setCurrentPlan(payload.plan);
      }

      setContentMessages((messages) => [
        ...messages,
        {
          plan: payload.plan ?? null,
          role: "otto",
          text: payload.reply ?? "I updated the plan."
        }
      ]);
    } catch (error) {
      setContentMessages((messages) => [
        ...messages,
        {
          role: "otto",
          text:
            error instanceof Error
              ? error.message
              : "I could not refine that plan just now."
        }
      ]);
    } finally {
      setIsContentSending(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[8px] border border-ink/10 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-signal">Studio</p>
      <h1 className="mt-1 text-[28px] font-semibold leading-8 tracking-tight">Build on your breakout</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/58">
        “{recommendation?.reasoning[0] ?? "Your breakout post shows the clearest repeatable content signal in the profile."}”
      </p>

      <div className="mt-4 flex-1 overflow-y-auto border-t border-ink/10 pt-4 pr-2">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink/32">
          This week&apos;s content plan
        </p>
        <PlanBlock title="Concept">
          {currentPlan.concept}
        </PlanBlock>
        <PlanBlock title="Hook">
          {currentPlan.hook}
        </PlanBlock>
        <PlanBlock title="Script">
          {currentPlan.script.split("\n").map((line) => (
            <span className="block" key={line}>{line}</span>
          ))}
        </PlanBlock>
        <PlanBlock title="Caption">
          {currentPlan.caption}
        </PlanBlock>

        {contentMessages.length > 0 ? (
          <div className="mt-4 grid gap-3 border-t border-ink/10 pt-4">
            {contentMessages.map((message, index) => (
              <div className="grid gap-3" key={`${message.role}-${index}`}>
                <div
                  className={`rounded-[6px] px-3 py-2 text-sm leading-5 ${
                    message.role === "user"
                      ? "ml-auto max-w-[78%] bg-ink text-white"
                      : "mr-auto max-w-[82%] bg-stone text-ink/70"
                  }`}
                >
                  {message.text}
                </div>
                {message.role === "otto" && message.plan ? (
                  <ContentPlanBlock plan={message.plan} />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-3 border-t border-ink/10 pt-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-ink/32">
          Refine this plan
        </p>
        <div className="flex flex-wrap gap-2">
          {["More hook options", "Different trend angle", "Shorten the script", "More caption options"].map((action) => (
            <button
              className="rounded-full border border-ink/12 px-4 py-2 text-sm text-ink/58 transition hover:border-ink/30 hover:text-ink"
              disabled={isContentSending}
              key={action}
              onClick={() => handleContentSubmit(action)}
              type="button"
            >
              {action}
            </button>
          ))}
        </div>
      </div>
      <PromptBar
        className="mt-3"
        disabled={isContentSending}
        onSubmit={handleContentSubmit}
        placeholder={
          isContentSending
            ? "Otto is thinking..."
            : "e.g. make the hook punchier, try a shorter script"
        }
      />
    </section>
  );
}

function PricingContextPanel({ creator }: { creator: AnalyzeResponse["creator"] }) {
  return (
    <SidePanel contentClassName="flex h-full flex-col">
      <ProfileMini creator={creator} />
      <div className="mt-4 grid items-start gap-3">
        <PillLabel>What justifies your rate</PillLabel>
        <SoftBlock eyebrow="Regional benchmark">
          <p className="text-base font-semibold leading-5 tracking-tight">
            S/ 350-600 per video for 100-150K follower LatAm creators.
          </p>
          <p className="mt-1 text-xs leading-5 text-ink/52">
            Use this as the floor, then adjust for your actual views and engagement.
          </p>
        </SoftBlock>
        <SoftBlock eyebrow="Your engagement">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xl font-semibold tracking-tight">{creator.engagementRate}%</p>
            <span className="rounded-full bg-moss/10 px-3 py-1 text-xs font-semibold text-moss">
              ↑ 0.57pt
            </span>
          </div>
          <p className="mt-2 rounded-[6px] bg-[#f4ead2] px-3 py-2 text-xs leading-4 text-[#9b7625]">
            27% above regional benchmark
          </p>
        </SoftBlock>
      </div>
      <div className="mt-9 grid items-start gap-3">
        <SoftBlock eyebrow="Account tier">
          <p className="text-base font-semibold leading-5 tracking-tight">Mid-size & global brands</p>
          <p className="mt-1 text-xs leading-5 text-ink/52">
            Supported by your engagement level
          </p>
        </SoftBlock>
      </div>
    </SidePanel>
  );
}

function PricingPanel({
  creator,
  recommendation
}: {
  creator: AnalyzeResponse["creator"];
  recommendation: Recommendation | null;
}) {
  const baseRates = useMemo(() => getRateRows(creator), [creator]);
  const [rates, setRates] = useState<PricingRateRow[]>(baseRates);
  const [pricingMessages, setPricingMessages] = useState<PricingChatMessage[]>([]);
  const [isPricingSending, setIsPricingSending] = useState(false);

  useEffect(() => {
    setRates(baseRates);
    setPricingMessages([]);
    setIsPricingSending(false);
  }, [baseRates]);

  async function handlePricingSubmit(message: string) {
    const trimmedMessage = message.trim();

    if (!trimmedMessage || isPricingSending) {
      return;
    }

    setPricingMessages((messages) => [
      ...messages,
      { role: "user", text: trimmedMessage }
    ]);
    setIsPricingSending(true);

    try {
      const response = await fetch("/api/pricing-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          currentRates: rates,
          message: trimmedMessage,
          profile: creator,
          recommendation
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update pricing.");
      }

      if (payload.rates) {
        setRates(payload.rates);
      }

      setPricingMessages((messages) => [
        ...messages,
        {
          note: payload.note ?? null,
          rates: payload.rates ?? null,
          role: "otto",
          text: payload.reply ?? "I updated the pricing guidance."
        }
      ]);
    } catch (error) {
      setPricingMessages((messages) => [
        ...messages,
        {
          role: "otto",
          text:
            error instanceof Error
              ? error.message
              : "I could not update pricing just now."
        }
      ]);
    } finally {
      setIsPricingSending(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[8px] border border-ink/10 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-signal">Pricing</p>
      <h1 className="mt-1 text-[28px] font-semibold leading-8 tracking-tight">Your rate card</h1>
      <p className="mt-2 text-sm leading-6 text-ink/58">
        Base rates — mid-size brand, organic, standard timeline
      </p>

      <div className="mt-4 flex-1 overflow-y-auto border-t border-ink/10 pt-4 pr-2">
        <RateRows rows={rates} />
        {recommendation ? (
          <p className="mt-4 max-w-3xl text-sm leading-6 text-ink/58">
            {recommendation.reasoning[0]}
          </p>
        ) : null}
        {pricingMessages.length > 0 ? (
          <div className="mt-4 grid gap-3 border-t border-ink/10 pt-4">
            {pricingMessages.map((message, index) => (
              <div className="grid gap-3" key={`${message.role}-${index}`}>
                <div
                  className={`rounded-[6px] px-3 py-2 text-sm leading-5 ${
                    message.role === "user"
                      ? "ml-auto max-w-[78%] bg-ink text-white"
                      : "mr-auto max-w-[82%] bg-stone text-ink/70"
                  }`}
                >
                  {message.text}
                </div>
                {message.role === "otto" && message.rates ? (
                  <PricingUpdateBlock note={message.note ?? null} rows={message.rates} />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <PromptBar
        className="mt-3"
        disabled={isPricingSending}
        onSubmit={handlePricingSubmit}
        placeholder={
          isPricingSending
            ? "Otto is thinking..."
            : "e.g. what if Coca-Cola wants a paid ad for their social media?"
        }
      />
    </section>
  );
}

function RateRows({ rows }: { rows: PricingRateRow[] }) {
  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <div
          className="flex items-center justify-between gap-4 rounded-[8px] border border-ink/10 bg-stone px-4 py-3 text-sm"
          key={row.label}
        >
          <span>{row.label}</span>
          <span className="shrink-0 font-semibold">S/ {row.value}</span>
        </div>
      ))}
    </div>
  );
}

function PricingUpdateBlock({
  note,
  rows
}: {
  note: string | null;
  rows: PricingRateRow[];
}) {
  return (
    <article>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink/32">
        Updated rate card
      </p>
      {note ? (
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/58">{note}</p>
      ) : null}
      <div className="mt-3">
        <RateRows rows={rows} />
      </div>
    </article>
  );
}

function SidePanel({
  children,
  contentClassName = "gap-2"
}: {
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <aside className="min-h-0 overflow-hidden rounded-[8px] border border-ink/10 bg-white p-4">
      <div className={`grid ${contentClassName}`}>{children}</div>
    </aside>
  );
}

function ProfileMini({ creator }: { creator: AnalyzeResponse["creator"] }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <Avatar creator={creator} />
      <div className="min-w-0">
        <h2 className="truncate text-xl font-semibold tracking-tight">@{creator.handle}</h2>
        <p className="text-sm text-ink/50">{formatPlatformName(creator.platform)}</p>
        <p className="truncate text-sm text-ink/50">
          {formatCompactNumber(creator.followerCount)} followers
        </p>
      </div>
    </div>
  );
}

function PillLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-semibold uppercase leading-none tracking-[0.14em] text-ink">
      {children}
    </span>
  );
}

function SoftBlock({
  children,
  eyebrow
}: {
  children: React.ReactNode;
  eyebrow: string;
}) {
  return (
    <article className="rounded-[6px] bg-stone px-3 py-2">
      <p className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-ink">
        {eyebrow}
      </p>
      {children}
    </article>
  );
}

function BrandChip({
  active = false,
  children,
  onClick
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`w-fit rounded-full border px-3 py-1 text-left text-sm transition ${
        active
          ? "border-signal bg-signal/5 font-semibold text-signal"
          : "border-ink/15 bg-white text-ink/58 hover:border-ink/30 hover:text-ink"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function MetricHighlight({ children }: { children: React.ReactNode }) {
  return <mark className="rounded bg-[#f4dfad] px-1 text-[#a87500]">{children}</mark>;
}

function EmailDraftBlock({
  body,
  subject
}: {
  body: string;
  subject: string;
}) {
  const [copyLabel, setCopyLabel] = useState("Copy");

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(body);
      setCopyLabel("Copied");
      window.setTimeout(() => setCopyLabel("Copy"), 1400);
    } catch {
      setCopyLabel("Failed");
      window.setTimeout(() => setCopyLabel("Copy"), 1400);
    }
  }

  return (
    <article>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink/32">
          Drafted email
        </p>
        <button
          className="rounded-[6px] border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/55 transition hover:border-ink/30 hover:text-ink"
          onClick={copyBody}
          type="button"
        >
          {copyLabel}
        </button>
      </div>
      <h2 className="mt-3 text-base font-semibold">{subject}</h2>
      <div className="mt-3 max-w-3xl space-y-3 text-sm leading-6 text-ink/62">
        {body.split(/\n{2,}/).map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </article>
  );
}

function ContentPlanBlock({ plan }: { plan: ContentPlanDraft }) {
  return (
    <article>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink/32">
        Updated content plan
      </p>
      <PlanBlock title="Concept">{plan.concept}</PlanBlock>
      <PlanBlock title="Hook">{plan.hook}</PlanBlock>
      <PlanBlock title="Script">
        {plan.script.split("\n").map((line) => (
          <span className="block" key={line}>{line}</span>
        ))}
      </PlanBlock>
      <PlanBlock title="Caption">{plan.caption}</PlanBlock>
    </article>
  );
}

function PlanBlock({
  children,
  title
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="mt-4 text-sm leading-6 text-ink/58">
      <h2 className="mb-1 font-semibold text-ink/62">{title}</h2>
      <p>{children}</p>
    </div>
  );
}

function PromptBar({
  className = "mt-4",
  disabled = false,
  onSubmit,
  placeholder
}: {
  className?: string;
  disabled?: boolean;
  onSubmit?: (message: string) => void;
  placeholder: string;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!value.trim() || disabled) {
      return;
    }

    onSubmit?.(value);
    setValue("");
  }

  return (
    <form className={`${className} flex gap-2 border-t border-ink/10 pt-4`} onSubmit={handleSubmit}>
      <input
        className="h-10 flex-1 rounded-[6px] border border-ink/10 px-3 text-sm outline-none placeholder:text-ink/32 focus:border-signal"
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
      <button
        className="h-10 w-10 rounded-[6px] bg-ink text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled || !value.trim()}
        type="submit"
      >
        →
      </button>
    </form>
  );
}

function TikTokSpotlight({
  analyzedVideoCount,
  breakoutPost,
  creatorAvgViews
}: {
  analyzedVideoCount: number;
  breakoutPost: RecentPost | null;
  creatorAvgViews: number | null;
}) {
  if (!breakoutPost) {
    return null;
  }

  return (
    <section className="grid min-h-[58px] items-center gap-3 rounded-[8px] bg-[#101010] px-4 py-1.5 text-white md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-white/82">
          Last week&apos;s top video
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            {formatNumber(breakoutPost.views ?? 0)} views
          </h2>
          <p className="text-sm font-semibold text-white/78">
            {breakoutPost.engagementRate}% engagement
          </p>
          <p className="text-sm text-white/58">
            Recent Avg Views: {formatNumber(creatorAvgViews ?? 0)} ({analyzedVideoCount} latest videos)
          </p>
        </div>
      </div>
      <div className="justify-self-end">
        <PostThumbnail dark hideText post={breakoutPost} />
      </div>
    </section>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article className="rounded-[6px] bg-stone p-4">
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

function PostThumbnail({
  dark = false,
  hideText = false,
  post
}: {
  dark?: boolean;
  hideText?: boolean;
  post: RecentPost;
}) {
  return (
    <article
      className={`grid rounded-[6px] p-2 ${
        dark
          ? hideText
            ? "grid-cols-[40px_auto] items-start gap-2 bg-transparent"
            : "grid-cols-[48px_1fr] gap-3 bg-transparent"
          : "grid-cols-[76px_1fr] gap-3 bg-stone"
      }`}
    >
      {post.thumbnailUrl ? (
        <img
          alt=""
          className={`${dark ? "h-[46px] w-[40px]" : "h-[92px] w-[76px]"} rounded-[6px] object-cover`}
          src={post.thumbnailUrl}
        />
      ) : (
        <div className={`${dark ? "h-[46px] w-[40px]" : "h-[92px] w-[76px]"} rounded-[6px] bg-ink/10`} />
      )}
      {hideText ? (
        <PostExternalLink postUrl={post.postUrl ?? null} />
      ) : (
        <div className="min-w-0 py-1">
          <p className={`line-clamp-2 font-medium ${dark ? "text-xs text-white" : "text-sm text-ink"}`}>
            {post.caption || post.postType}
          </p>
          <p className={`mt-2 text-xs ${dark ? "text-white/75" : "text-ink/50"}`}>
            {post.views !== null ? `${formatNumber(post.views)} views · ` : ""}
            {post.engagementRate}% engagement
          </p>
        </div>
      )}
    </article>
  );
}

function PostExternalLink({ postUrl }: { postUrl: string | null }) {
  if (!postUrl) {
    return (
      <span
        aria-label="Video link unavailable"
        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-sm font-semibold text-white/24"
      >
        ↗
      </span>
    );
  }

  return (
    <a
      aria-label="Open video in a new tab"
      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/16 text-sm font-semibold text-white/70 transition hover:border-white/35 hover:text-white"
      href={postUrl}
      rel="noreferrer"
      target="_blank"
    >
      ↗
    </a>
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
    <aside className="landing-rise overflow-hidden rounded-[8px] border border-ink/10 bg-white">
      <div className="border-b border-ink/10 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-signal">
          Today
        </p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h2 className="text-[26px] font-semibold tracking-tight">Action Center</h2>
          <span className="rounded-full bg-stone px-3 py-1 text-xs font-semibold text-ink/50">
            {recommendations.length}
          </span>
        </div>
      </div>

      <div>
        {recommendations.map((recommendation, index) => {
          const isSelected = selectedRecommendation?.title === recommendation.title;
          const mission = getMissionDisplay(recommendation, index);

          return (
            <button
              className={`group block w-full border-t border-ink/10 px-5 py-4 text-left transition ${
                isSelected ? "bg-[#fffaf0]" : "bg-white hover:bg-stone/60"
              }`}
              key={recommendation.title}
              onClick={() => onSelect(recommendation)}
              type="button"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/42">
                    {mission.category}
                  </span>
                  <span className="mt-2 block text-base font-semibold leading-6 tracking-tight text-ink">
                    {recommendation.title}
                  </span>
                </span>
                <span className="rounded-full bg-stone px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
                  {mission.priority}
                </span>
              </span>

              <span className="mt-3 block text-sm leading-6 text-ink/58">
                {recommendation.description}
              </span>
              <span className="mt-3 grid gap-2 text-[11px]">
                <MissionMeta label="Expected impact" value={mission.expectedImpact} />
                <MissionMeta label="Confidence" value={mission.confidenceScore} />
                <MissionMeta label="Effort" value={mission.estimatedEffort} />
              </span>
              <span className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-ink/48">
                Open mission →
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
    <span className="flex items-center justify-between gap-3 rounded-[6px] bg-stone px-3 py-2">
      <span className="font-medium text-ink/40">{label}</span>
      <span className="truncate font-semibold text-ink/68">{value}</span>
    </span>
  );
}

function getMissionDisplay(recommendation: Recommendation, index: number): MissionDisplay {
  const priority = index === 0 ? "High" : index === 1 ? "Medium" : "Low";
  const confidenceBase = 78 + Math.min(recommendation.supportingMetrics.length, 4) * 4;
  const confidenceScore = `${Math.min(confidenceBase + recommendation.reasoning.length, 96)}%`;
  const expectedImpact =
    recommendation.supportingMetrics[0]?.trend ||
    recommendation.supportingMetrics[0]?.value ||
    "Qualified lift";
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
    return "Brand pipeline";
  }

  if (actionType === "content") {
    return "Content studio";
  }

  return "Pricing";
}

function getRecommendationForTab(recommendations: Recommendation[], activeTab: ActiveTab) {
  if (activeTab === "dashboard") {
    return recommendations[0] ?? null;
  }

  const actionTypeByTab: Record<Exclude<ActiveTab, "dashboard">, Recommendation["actionType"]> = {
    content: "content",
    outreach: "outreach",
    pricing: "pricing"
  };

  return recommendations.find((recommendation) => recommendation.actionType === actionTypeByTab[activeTab]) ?? null;
}

function getTabForActionType(actionType: Recommendation["actionType"]): ActiveTab {
  if (actionType === "outreach") {
    return "outreach";
  }

  if (actionType === "content") {
    return "content";
  }

  return "pricing";
}

function getBrandName(recommendation: Recommendation | null) {
  const title = recommendation?.title ?? "";
  const matchedBrand = getKnownBrands().find((brand) =>
    title.toLowerCase().includes(brand.toLowerCase().split(" ")[0])
  );

  return matchedBrand ?? "LATAM Airlines";
}

function getBrandOptions(recommendation: Recommendation | null) {
  const preferredBrand = getBrandName(recommendation);

  return [preferredBrand, "Adidas", "Rappi"].filter(
    (brand, index, brands) => brands.indexOf(brand) === index
  );
}

function getKnownBrands() {
  return ["LATAM Airlines", "Adidas", "Rappi", "Nike", "Coca-Cola"];
}

function detectRequestedBrand(message: string) {
  const normalizedMessage = message.toLowerCase();

  return getKnownBrands().find((brand) =>
    normalizedMessage.includes(brand.toLowerCase().split(" ")[0])
  ) ?? null;
}

function buildBrandEmailDraft({
  brand,
  creator,
  metric
}: {
  brand: string;
  creator: AnalyzeResponse["creator"];
  metric: Recommendation["supportingMetrics"][number] | undefined;
}) {
  const subject = `Lima creator, ${formatCompactNumber(creator.followerCount)} ${formatPlatformName(creator.platform)}, travel + culture content`;
  const body = `Hi there,

I'm @${creator.handle}, a Lima-based creator with ${formatCompactNumber(creator.followerCount)} ${formatPlatformName(creator.platform)} followers focused on ${creator.contentCategories.slice(0, 2).join(" and ") || "creator culture"}. My recent posts reached ${metric?.value ?? `${creator.engagementRate}% engagement`} ${metric?.trend ? `— ${metric.trend}` : "with strong engagement"}.

I'd love to put together a short series showcasing ${brand} to my audience across Peru and the wider LatAm market. Happy to send a full media kit.

Would you be open to a quick call this week?

Best,
@${creator.handle}`;

  return { body, subject };
}

function formatBrandEmailText(email: { body: string; subject: string }) {
  return `${email.subject}\n\n${email.body}`;
}

function formatContentPlanText(plan: ContentPlanDraft) {
  return [
    `Concept: ${plan.concept}`,
    `Hook: ${plan.hook}`,
    `Script: ${plan.script}`,
    `Caption: ${plan.caption}`
  ].join("\n\n");
}

function formatPlatformName(platform: Platform) {
  return platform === "tiktok" ? "TikTok" : "Instagram";
}

function getRateRows(creator: AnalyzeResponse["creator"]) {
  const followerMultiplier = Math.max(0.85, creator.followerCount / 120000);
  const baseLow = Math.round(520 * followerMultiplier / 10) * 10;
  const baseHigh = Math.round(650 * followerMultiplier / 10) * 10;

  return [
    {
      label: `Single ${formatPlatformName(creator.platform)} ${creator.platform === "tiktok" ? "video" : "reel"}`,
      value: `${baseLow}-${baseHigh}`
    },
    {
      label: "Video + Instagram story",
      value: `${Math.round(baseLow * 1.25)}-${Math.round(baseHigh * 1.25)}`
    },
    {
      label: "2-video series",
      value: `${Math.round(baseLow * 1.7)}-${Math.round(baseHigh * 1.7)}`
    },
    {
      label: "UGC content only (they post it)",
      value: `${Math.round(baseLow * 1.35)}-${Math.round(baseHigh * 1.35)}`
    }
  ];
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

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact"
  }).format(value);
}

function mean(values: number[]) {
  const validValues = values.filter((value) => Number.isFinite(value));

  if (validValues.length === 0) {
    return 0;
  }

  return validValues.reduce((total, value) => total + value, 0) / validValues.length;
}

function roundMetric(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}
