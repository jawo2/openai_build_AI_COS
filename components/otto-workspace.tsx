"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AnalyzeResponse, EmailDraft, Recommendation } from "@/lib/types";

type OttoWorkspaceProps = {
  creator: AnalyzeResponse["creator"];
  selectedRecommendation: Recommendation | null;
};

type WorkspaceSectionProps = {
  children: React.ReactNode;
  defaultOpen?: boolean;
  title: string;
};

type ConversationMessage = {
  actions?: NextAction[];
  content: string;
  id: string;
  isStreaming?: boolean;
  role: "otto" | "user";
};

type NextAction = {
  description: string;
  icon: string;
  title: string;
  tool:
    | "draft_outreach"
    | "explain_proof"
    | "define_test"
    | "assess_risk"
    | "build_pricing"
    | "create_plan";
};

type PreparedAsset = {
  preview: string;
  title: string;
};

type StreamEvent = {
  data: string;
  event: string;
};

export function OttoWorkspace({
  creator,
  selectedRecommendation
}: OttoWorkspaceProps) {
  const [email, setEmail] = useState<EmailDraft | null>(null);
  const [emailBody, setEmailBody] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [conversationInput, setConversationInput] = useState("");
  const [loadingActionsForMessage, setLoadingActionsForMessage] = useState<string | null>(null);
  const [revealedAssetCount, setRevealedAssetCount] = useState(0);
  const conversationKey = useMemo(
    () =>
      selectedRecommendation
        ? `otto-conversation:${creator.platform}:${creator.handle}:${slugify(selectedRecommendation.title)}`
        : null,
    [creator.handle, creator.platform, selectedRecommendation]
  );

  const requestNextActions = useCallback(
    async (
      ottoMessage: ConversationMessage,
      nextConversation: ConversationMessage[]
    ) => {
      if (!selectedRecommendation || ottoMessage.role !== "otto") {
        return;
      }

      setLoadingActionsForMessage(ottoMessage.id);

      try {
        const response = await fetch("/api/next-actions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            profile: creator,
            recommendation: selectedRecommendation,
            assistantMessage: ottoMessage.content,
            recentConversation: nextConversation.slice(-8).map((message) => ({
              content: message.content,
              role: message.role
            }))
          })
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to generate next actions.");
        }

        const actions = Array.isArray(payload.actions)
          ? (payload.actions as NextAction[])
          : getFallbackNextActions(selectedRecommendation);

        setConversation((currentConversation) =>
          currentConversation.map((message) =>
            message.id === ottoMessage.id
              ? {
                  ...message,
                  actions
                }
              : message
          )
        );
      } catch {
        setConversation((currentConversation) =>
          currentConversation.map((message) =>
            message.id === ottoMessage.id
              ? {
                  ...message,
                  actions: getFallbackNextActions(selectedRecommendation)
                }
              : message
          )
        );
      } finally {
        setLoadingActionsForMessage((currentMessageId) =>
          currentMessageId === ottoMessage.id ? null : currentMessageId
        );
      }
    },
    [creator, selectedRecommendation]
  );

  const ensureLatestOttoMessageHasActions = useCallback(
    (nextConversation: ConversationMessage[]) => {
      const latestOttoMessage = [...nextConversation]
        .reverse()
        .find((message) => message.role === "otto");

      if (latestOttoMessage && !latestOttoMessage.actions?.length) {
        void requestNextActions(latestOttoMessage, nextConversation);
      }
    },
    [requestNextActions]
  );

  const streamWelcomeMessage = useCallback(
    async (welcomeMessage: ConversationMessage) => {
      if (!selectedRecommendation) {
        return;
      }

      let streamedContent = "";

      try {
        const response = await fetch("/api/otto-welcome", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            profile: creator,
            recommendation: selectedRecommendation
          })
        });

        if (!response.ok || !response.body) {
          throw new Error("Unable to stream Otto welcome.");
        }

        await readEventStream(response.body, (streamEvent) => {
          if (streamEvent.event === "delta") {
            const payload = JSON.parse(streamEvent.data) as { delta?: string };
            streamedContent += payload.delta ?? "";

            setConversation((currentConversation) =>
              currentConversation.map((message) =>
                message.id === welcomeMessage.id
                  ? {
                      ...message,
                      content: streamedContent,
                      isStreaming: true
                    }
                  : message
              )
            );
          }
        });

        const finalMessage: ConversationMessage = {
          ...welcomeMessage,
          content: ensureNextQuestion(streamedContent || createFallbackWelcome(selectedRecommendation)),
          isStreaming: false
        };

        setConversation([finalMessage]);
        void requestNextActions(finalMessage, [finalMessage]);
      } catch {
        const fallbackMessage: ConversationMessage = {
          ...welcomeMessage,
          content: createFallbackWelcome(selectedRecommendation),
          isStreaming: false
        };

        setConversation([fallbackMessage]);
        void requestNextActions(fallbackMessage, [fallbackMessage]);
      }
    },
    [creator, requestNextActions, selectedRecommendation]
  );

  useEffect(() => {
    setEmail(null);
    setEmailBody("");
    setIsDrafting(false);
    setEmailError(null);
    setCopied(false);
    setRevealedAssetCount(0);
  }, [selectedRecommendation]);

  useEffect(() => {
    if (!selectedRecommendation) {
      setRevealedAssetCount(0);
      return;
    }

    const assets = getPreparedAssets(selectedRecommendation);
    setRevealedAssetCount(0);

    const interval = window.setInterval(() => {
      setRevealedAssetCount((count) => {
        if (count >= assets.length) {
          window.clearInterval(interval);
          return count;
        }

        return count + 1;
      });
    }, 220);

    return () => window.clearInterval(interval);
  }, [selectedRecommendation]);

  useEffect(() => {
    if (!selectedRecommendation || !conversationKey) {
      setConversation([]);
      setConversationInput("");
      return;
    }

    const initialMessage = createInitialOttoMessage(selectedRecommendation);

    try {
      const storedConversation = window.localStorage.getItem(conversationKey);
      const parsedConversation = storedConversation
        ? (JSON.parse(storedConversation) as ConversationMessage[])
        : null;

      if (parsedConversation?.length) {
        const restoredConversation = ensureOttoStartsConversation(
          parsedConversation,
          initialMessage
        );
        setConversation(restoredConversation);
        ensureLatestOttoMessageHasActions(restoredConversation);
        return;
      }
    } catch {
      // Ignore malformed local storage and reset to Otto's contextual opener.
    }

    setConversation([initialMessage]);
    void streamWelcomeMessage(initialMessage);
    setConversationInput("");
  }, [
    conversationKey,
    ensureLatestOttoMessageHasActions,
    requestNextActions,
    selectedRecommendation,
    streamWelcomeMessage
  ]);

  useEffect(() => {
    if (!conversationKey || conversation.length === 0) {
      return;
    }

    window.localStorage.setItem(conversationKey, JSON.stringify(conversation));
  }, [conversation, conversationKey]);

  useEffect(() => {
    if (!email) {
      return;
    }

    setEmailBody("");

    let index = 0;
    const interval = window.setInterval(() => {
      index += 3;
      setEmailBody(email.body.slice(0, index));

      if (index >= email.body.length) {
        window.clearInterval(interval);
      }
    }, 18);

    return () => window.clearInterval(interval);
  }, [email]);

  if (!selectedRecommendation) {
    return (
      <section className="rounded-[8px] border border-ink/10 bg-white p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-signal">
          Otto Workspace
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">Preparing mission</h2>
      </section>
    );
  }

  async function draftOutreach() {
    if (!selectedRecommendation) {
      return;
    }

    setIsDrafting(true);
    setEmailError(null);
    setCopied(false);

    try {
      const response = await fetch("/api/generate-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          profile: creator,
          recommendation: selectedRecommendation
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to draft outreach.");
      }

      setEmail(payload);
    } catch (error) {
      setEmailError(
        error instanceof Error ? error.message : "Unable to draft outreach."
      );
    } finally {
      setIsDrafting(false);
    }
  }

  async function copyEmail() {
    if (!email) {
      return;
    }

    await navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${emailBody}`);
    setCopied(true);
  }

  function submitConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendConversationMessage(conversationInput);
  }

  function sendConversationMessage(rawMessage: string) {
    if (!selectedRecommendation) {
      return;
    }

    const message = rawMessage.trim();

    if (!message) {
      return;
    }

    const userMessage: ConversationMessage = {
      content: message,
      id: createMessageId("user"),
      role: "user"
    };
    const ottoMessage: ConversationMessage = {
      content: ensureNextQuestion(createContextualOttoReply(selectedRecommendation, message)),
      id: createMessageId("otto"),
      role: "otto"
    };

    setConversationInput("");
    setConversation((currentConversation) => {
      const nextConversation = [...currentConversation, userMessage, ottoMessage];
      void requestNextActions(ottoMessage, nextConversation);

      return nextConversation;
    });
  }

  function handleNextAction(action: NextAction) {
    if (action.tool === "draft_outreach") {
      void draftOutreach();
      return;
    }

    const workflowPromptByTool: Record<NextAction["tool"], string> = {
      assess_risk: "Assess the risk in this mission",
      build_pricing: "Build the pricing rationale",
      create_plan: "Create an execution plan",
      define_test: "Define the content test",
      draft_outreach: "Draft the outreach",
      explain_proof: "Explain the proof behind this"
    };

    sendConversationMessage(workflowPromptByTool[action.tool]);
  }

  const preparedAssets = getPreparedAssets(selectedRecommendation);
  const workspaceMode = getWorkspaceMode(selectedRecommendation);

  return (
    <section
      className="landing-rise min-w-0 rounded-[8px] border border-ink/10 bg-white"
      id="workspace"
    >
      <div className="px-7 pb-5 pt-7">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-signal">
          {workspaceMode.eyebrow}
        </p>
        <h2 className="mt-2 text-[30px] font-semibold leading-9 tracking-tight">
          {selectedRecommendation.title}
        </h2>
        <p className="mt-3 max-w-3xl font-serif text-lg italic leading-8 text-ink/78">
          {workspaceMode.lede}
        </p>
      </div>

      <div className="grid gap-4 px-7 pb-7">
        <WorkspaceSection defaultOpen title="Recommendation Summary">
          <p className="text-sm leading-6 text-ink/64">
            {selectedRecommendation.description}
          </p>
          <span className="mt-4 inline-flex rounded-full bg-stone px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink/55">
            {selectedRecommendation.actionType}
          </span>
        </WorkspaceSection>

        <WorkspaceSection defaultOpen title="Expected Impact">
          <div className="grid gap-2 sm:grid-cols-3">
            {selectedRecommendation.supportingMetrics.map((metric) => (
              <div className="rounded-[6px] border border-ink/10 bg-stone p-3" key={metric.label}>
                <p className="text-xs font-medium text-ink/45">{metric.label}</p>
                <p className="mt-1 text-lg font-semibold">{metric.value}</p>
                <p className="text-xs text-moss">{metric.trend}</p>
              </div>
            ))}
          </div>
        </WorkspaceSection>

        <WorkspaceSection defaultOpen title="Why Otto Recommends This">
          <ul className="grid gap-2">
            {selectedRecommendation.reasoning.map((reason) => (
              <li className="rounded-[6px] bg-stone p-3 text-sm leading-6 text-ink/66" key={reason}>
                {reason}
              </li>
            ))}
          </ul>
        </WorkspaceSection>

        <WorkspaceSection title="AI Suggested Actions">
          <ol className="grid gap-2">
            {getSuggestedActions(selectedRecommendation).map((action) => (
              <li className="rounded-[6px] border border-ink/10 px-3 py-2 text-sm text-ink/68" key={action}>
                {action}
              </li>
            ))}
          </ol>
        </WorkspaceSection>

        <WorkspaceSection defaultOpen title="Conversation Timeline">
          <div className="grid gap-4">
            <div className="grid max-h-[360px] gap-3 overflow-y-auto pr-1">
              {conversation.map((message) => (
                <div
                  className={`grid gap-1 ${
                    message.role === "user" ? "justify-items-end" : "justify-items-start"
                  }`}
                  key={message.id}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/35">
                    {message.role === "otto" ? "Otto" : "You"}
                  </span>
                  <p
                    className={`max-w-[92%] whitespace-pre-wrap rounded-[6px] px-3 py-2 text-sm leading-6 ${
                      message.role === "otto"
                        ? "bg-stone text-ink/68"
                        : "bg-ink text-white"
                    }`}
                  >
                    {message.content || "Otto is preparing your brief..."}
                  </p>
                  {message.role === "otto" ? (
                    <div className="flex max-w-[92%] flex-wrap gap-2">
                      {message.actions?.map((action) => (
                        <button
                          className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink/60 transition hover:border-ink/25 hover:text-ink"
                          key={`${message.id}-${action.title}`}
                          onClick={() => handleNextAction(action)}
                          title={action.description}
                          type="button"
                        >
                          <span>{getActionIcon(action.icon)}</span>
                          {action.title}
                        </button>
                      ))}
                      {loadingActionsForMessage === message.id ? (
                        <span className="rounded-full bg-stone px-3 py-1.5 text-xs font-semibold text-ink/40">
                          Generating actions...
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submitConversation}>
              <input
                className="min-h-11 flex-1 rounded-[8px] border border-ink/10 bg-white px-4 text-sm outline-none transition placeholder:text-ink/30 focus:border-signal"
                onChange={(event) => setConversationInput(event.target.value)}
                placeholder={workspaceMode.placeholder}
                value={conversationInput}
              />
              <button
                className="min-h-11 rounded-[8px] bg-ink px-4 text-sm font-semibold text-white transition hover:bg-ink/86"
                type="submit"
              >
                →
              </button>
            </form>
          </div>
        </WorkspaceSection>

        <WorkspaceSection defaultOpen title="Generated Assets">
          <div className="mb-4 grid gap-2">
            {preparedAssets.map((asset, index) => (
              <details
                className={`rounded-[6px] border border-ink/10 bg-white transition ${
                  index < revealedAssetCount ? "opacity-100" : "opacity-0"
                }`}
                key={asset.title}
                open={index === 0}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-ink/70">
                  <span>✓ {asset.title}</span>
                  <span className="text-xs font-medium text-ink/35">prepared</span>
                </summary>
                <p className="border-t border-ink/10 px-3 py-3 text-sm leading-6 text-ink/58">
                  {asset.preview}
                </p>
              </details>
            ))}
          </div>

          {email ? (
            <div className="rounded-[8px] border border-ink/10 bg-stone p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-signal">
                    Draft email
                  </p>
                  <input
                    className="mt-2 w-full rounded-[6px] border border-ink/10 bg-white px-3 py-2 text-lg font-semibold outline-none focus:border-signal sm:min-w-[360px]"
                    onChange={(event) =>
                      setEmail({
                        ...email,
                        subject: event.target.value
                      })
                    }
                    value={email.subject}
                  />
                </div>
                <button
                  className="h-10 rounded-[6px] border border-ink/15 bg-white px-4 text-sm font-semibold text-ink/68 transition hover:border-ink/35 hover:text-ink"
                  onClick={copyEmail}
                  type="button"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              <textarea
                className="mt-4 min-h-[220px] w-full resize-y rounded-[6px] border border-ink/10 bg-white p-3 text-sm leading-6 outline-none focus:border-signal"
                onChange={(event) => setEmailBody(event.target.value)}
                value={emailBody}
              />

              <div className="mt-4 rounded-[6px] border border-moss/20 bg-white p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-moss">
                  Metric proof
                </p>
                <p className="whitespace-pre-wrap text-sm leading-6 text-ink/68">
                  {highlightMetrics(
                    emailBody,
                    selectedRecommendation.supportingMetrics.map((metric) => metric.value)
                  )}
                </p>
              </div>
            </div>
          ) : null}
        </WorkspaceSection>

        <WorkspaceSection defaultOpen title="AI Next Actions">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-ink/58">
              Otto has prepared the starting materials. Choose the next workflow below or ask a specific follow-up.
            </p>
            <button
              className="min-h-11 rounded-[8px] bg-ink px-5 text-sm font-semibold text-white transition hover:bg-ink/86 disabled:cursor-not-allowed disabled:bg-ink/35"
              disabled={isDrafting}
              onClick={draftOutreach}
              type="button"
            >
              {isDrafting ? "Drafting..." : "Draft outreach"}
            </button>
          </div>

          {emailError ? (
            <p className="mt-3 rounded-md bg-signal/10 p-3 text-sm text-ink/70">
              {emailError}
            </p>
          ) : null}
        </WorkspaceSection>
      </div>
    </section>
  );
}

function WorkspaceSection({
  children,
  defaultOpen = false,
  title
}: WorkspaceSectionProps) {
  return (
    <details
      className="group border-t border-ink/10 bg-white first:border-t-0"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-ink/38">
        {title}
        <span className="text-sm text-ink/35 transition group-open:rotate-90">›</span>
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

function getWorkspaceMode(recommendation: Recommendation) {
  if (recommendation.actionType === "content") {
    return {
      eyebrow: "Studio",
      lede: `Build on the signal behind "${recommendation.title}" and turn it into an execution-ready content plan.`,
      placeholder: "e.g. make the hook punchier, try a shorter script"
    };
  }

  if (recommendation.actionType === "pricing") {
    return {
      eyebrow: "Pricing",
      lede: "Use the strongest creator metrics to justify a rate card and answer brand pricing questions with confidence.",
      placeholder: "e.g. what if a brand asks for a bundled rate?"
    };
  }

  return {
    eyebrow: "Brand pipeline",
    lede: "Turn the highest-fit partnership opportunity into a concrete outreach asset with metric-backed proof.",
    placeholder: "e.g. make the pitch more direct, show the strongest proof"
  };
}

function getSuggestedActions(recommendation: Recommendation) {
  if (recommendation.actionType === "outreach") {
    return [
      "Draft a partner-facing email using only verified metrics.",
      "Lead with the strongest supporting metric.",
      "Close with one specific collaboration ask."
    ];
  }

  if (recommendation.actionType === "content") {
    return [
      "Turn the recommendation into a repeatable content test.",
      "Use the top-performing metric as the test benchmark.",
      "Review results after the next 3 posts."
    ];
  }

  return [
    "Package the strongest proof points into a pricing rationale.",
    "Compare the recommended rate against current performance.",
    "Prepare one low-risk offer variant."
  ];
}

function createInitialOttoMessage(recommendation: Recommendation): ConversationMessage {
  return {
    content: "",
    id: createMessageId("otto"),
    isStreaming: true,
    role: "otto"
  };
}

function createFallbackWelcome(recommendation: Recommendation) {
  const metricText = formatMetricSummary(recommendation);

  return ensureNextQuestion(
    [
      "Good morning, Jaime",
      `I found one opportunity that should matter most today: ${recommendation.title}.`,
      `The reason is clear: ${metricText}. ${recommendation.reasoning[0] ?? recommendation.description}`,
      "I have already prepared the starting assets so you can move straight into execution."
    ].join("\n\n")
  );
}

function ensureNextQuestion(message: string) {
  const trimmedMessage = message.trim();

  if (trimmedMessage.endsWith("What would you like me to do next?")) {
    return trimmedMessage;
  }

  return `${trimmedMessage}\n\nWhat would you like me to do next?`;
}

function createContextualOttoReply(recommendation: Recommendation, userMessage: string) {
  const normalizedMessage = userMessage.toLowerCase();
  const primaryMetric = recommendation.supportingMetrics[0];
  const metricText = primaryMetric
    ? `${primaryMetric.label}: ${primaryMetric.value} (${primaryMetric.trend})`
    : formatMetricSummary(recommendation);

  if (normalizedMessage.includes("why")) {
    return [
      `The reason to prioritize "${recommendation.title}" is the metric evidence, not a generic best practice.`,
      `Primary proof: ${metricText}.`,
      recommendation.reasoning[1] ?? recommendation.reasoning[0] ?? recommendation.description
    ].join("\n");
  }

  if (normalizedMessage.includes("email") || normalizedMessage.includes("draft")) {
    return [
      "Use the draft asset flow for this mission.",
      `Lead with ${metricText}, then connect it directly to the ${formatActionType(recommendation.actionType)} ask.`,
      "Avoid adding any metric that is not already in this workspace."
    ].join("\n");
  }

  if (normalizedMessage.includes("risk") || normalizedMessage.includes("confidence")) {
    return [
      `Confidence is tied to ${recommendation.supportingMetrics.length} supporting metric signal${recommendation.supportingMetrics.length === 1 ? "" : "s"} and ${recommendation.reasoning.length} reasoning point${recommendation.reasoning.length === 1 ? "" : "s"}.`,
      `The main risk is overextending beyond the data. Keep execution narrow: ${recommendation.title}.`
    ].join("\n");
  }

  if (normalizedMessage.includes("steps") || normalizedMessage.includes("next")) {
    return [
      `Next, execute this as a ${formatActionType(recommendation.actionType)} mission.`,
      ...getSuggestedActions(recommendation).map((action) => `- ${action}`)
    ].join("\n");
  }

  return [
    `For this mission, I would keep the work anchored to "${recommendation.title}".`,
    `The relevant evidence is ${metricText}.`,
    `Best next move: ${getSuggestedActions(recommendation)[0]}`
  ].join("\n");
}

function getFallbackNextActions(recommendation: Recommendation): NextAction[] {
  if (recommendation.actionType === "outreach") {
    return [
      {
        description: "Generate a partner-facing email from the recommendation metrics.",
        icon: "mail",
        title: "Draft outreach",
        tool: "draft_outreach"
      },
      {
        description: "Explain the evidence behind this partnership mission.",
        icon: "chart",
        title: "Explain proof",
        tool: "explain_proof"
      },
      {
        description: "Identify execution risks before sending the asset.",
        icon: "shield",
        title: "Check risk",
        tool: "assess_risk"
      }
    ];
  }

  if (recommendation.actionType === "content") {
    return [
      {
        description: "Convert the recommendation into a measurable content test.",
        icon: "checklist",
        title: "Define test",
        tool: "define_test"
      },
      {
        description: "Create a short execution plan for this content mission.",
        icon: "spark",
        title: "Create plan",
        tool: "create_plan"
      },
      {
        description: "Review the proof behind the recommended content direction.",
        icon: "chart",
        title: "Explain proof",
        tool: "explain_proof"
      }
    ];
  }

  return [
    {
      description: "Build a pricing rationale from the supporting metrics.",
      icon: "tag",
      title: "Build pricing",
      tool: "build_pricing"
    },
    {
      description: "Review confidence and risks before using the recommendation.",
      icon: "shield",
      title: "Explain confidence",
      tool: "assess_risk"
    },
    {
      description: "Turn the pricing recommendation into a concrete offer.",
      icon: "checklist",
      title: "Create plan",
      tool: "create_plan"
    }
  ];
}

function getPreparedAssets(recommendation: Recommendation): PreparedAsset[] {
  if (recommendation.actionType === "outreach") {
    return [
      {
        title: "Partner Pitch Angle",
        preview: `Lead with ${formatMetricSummary(recommendation)} and frame the ask around ${recommendation.title.toLowerCase()}.`
      },
      {
        title: "Outreach Draft Brief",
        preview: "A concise brand email can be generated from the supporting metrics without introducing unverified claims."
      },
      {
        title: "Proof Points",
        preview: recommendation.reasoning.slice(0, 3).join(" ")
      },
      {
        title: "Collaboration Ask",
        preview: "Use a specific creator-led post series or campaign concept rather than a broad sponsorship request."
      },
      {
        title: "Follow-Up Plan",
        preview: "If the first email lands, send a media kit or two concept options as the next step."
      }
    ];
  }

  if (recommendation.actionType === "content") {
    return [
      {
        title: "5 Content Ideas",
        preview: `Build five posts around ${recommendation.title.toLowerCase()} and benchmark them against ${formatMetricSummary(recommendation)}.`
      },
      {
        title: "Script Outline",
        preview: "Start with the strongest hook, move quickly into proof, and end with one clear creator-business action."
      },
      {
        title: "Hook Suggestions",
        preview: "Use hooks that make the performance signal visible in the first line or first three seconds."
      },
      {
        title: "Caption Draft",
        preview: "Caption should reinforce the tested content angle and include the highest-performing category language."
      },
      {
        title: "Best Publishing Time",
        preview: "Use the timing suggested by the recommendation or keep posting time constant during the test."
      }
    ];
  }

  return [
    {
      title: "Pricing Rationale",
      preview: `Anchor the price story to ${formatMetricSummary(recommendation)}.`
    },
    {
      title: "Offer Structure",
      preview: "Package one low-risk offer and one premium option so the buyer can choose scope."
    },
    {
      title: "Negotiation Notes",
      preview: "Keep the rate tied to verified performance, not follower count alone."
    },
    {
      title: "Proof Summary",
      preview: recommendation.reasoning.slice(0, 3).join(" ")
    },
    {
      title: "Next Outreach Step",
      preview: "Send the offer with a concise proof block and one direct ask."
    }
  ];
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
      const event = chunk.match(/^event: (.+)$/m)?.[1];
      const data = chunk.match(/^data: (.+)$/m)?.[1];

      if (event && data) {
        onEvent({ data, event });
      }
    }
  }
}

function getActionIcon(icon: string) {
  const icons: Record<string, string> = {
    chart: "↗",
    checklist: "✓",
    mail: "@",
    shield: "◇",
    spark: "*",
    tag: "$"
  };

  return icons[icon] ?? "•";
}

function ensureOttoStartsConversation(
  conversation: ConversationMessage[],
  initialMessage: ConversationMessage
) {
  const validConversation = conversation.filter(
    (message) =>
      (message.role === "otto" || message.role === "user") &&
      typeof message.content === "string" &&
      typeof message.id === "string"
  ).map((message) =>
    message.role === "otto" && message.content
      ? {
          ...message,
          content: ensureNextQuestion(message.content),
          isStreaming: false
        }
      : message
  );

  if (validConversation[0]?.role === "otto") {
    return validConversation;
  }

  return [initialMessage, ...validConversation];
}

function formatMetricSummary(recommendation: Recommendation) {
  if (recommendation.supportingMetrics.length === 0) {
    return "the available creator performance signals";
  }

  return recommendation.supportingMetrics
    .slice(0, 3)
    .map((metric) => `${metric.label}: ${metric.value}`)
    .join(", ");
}

function formatActionType(actionType: Recommendation["actionType"]) {
  if (actionType === "outreach") {
    return "partnership";
  }

  if (actionType === "content") {
    return "content";
  }

  return "pricing";
}

function createMessageId(prefix: ConversationMessage["role"]) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function highlightMetrics(body: string, metrics: string[]) {
  const escapedMetrics = metrics
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);

  if (escapedMetrics.length === 0) {
    return body;
  }

  const matcher = new RegExp(`(${escapedMetrics.join("|")})`, "gi");
  const parts = body.split(matcher);

  return parts.map((part, index) => {
    const isMetric = metrics.some(
      (metric) => metric.toLowerCase() === part.toLowerCase()
    );

    return isMetric ? (
      <mark className="rounded bg-signal/15 px-1 text-ink" key={`${part}-${index}`}>
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    );
  });
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
