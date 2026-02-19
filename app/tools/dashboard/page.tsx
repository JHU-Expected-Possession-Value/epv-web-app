"use client";

import { useEffect, useState } from "react";
import Container from "@/components/Container";
import { apiGet } from "@/lib/api";

type Tab = "live-board" | "replay" | "scenario-editor";

const tabs: { id: Tab; label: string }[] = [
  { id: "live-board", label: "Live Board" },
  { id: "replay", label: "Replay" },
  { id: "scenario-editor", label: "Scenario Editor" },
];

// TypeScript types for API responses
type MatchesResponse = { match_ids: string[] };

type Moment = {
  match_id: string;
  index: number;
  event_type: string;
  team_name?: string | null;
  opponent_team_name?: string | null;
  player_name?: string | null;
  opponent_player_name?: string | null;
  period?: number | null;
  time_seconds?: number | null;
  start_frame?: number | null;
  end_frame?: number | null;
  center_frame?: number | null;
};

type MomentsResponse = { moments: Moment[] };

type WindowResponse = {
  match_id: string;
  start_frame: number;
  end_frame: number;
  frames: any[];
};

const tabContent: Record<Tab, { title: string; bullets: string[] }> = {
  "live-board": {
    title: "Live Board",
    bullets: [
      "Real-time EPV metrics and possession value tracking",
      "Interactive player positioning and field state visualization",
      "Live decision impact analysis and EPV deltas",
    ],
  },
  replay: {
    title: "Replay",
    bullets: [
      "Step through play-by-play events with EPV annotations",
      "Replay key moments (turnovers, missed shots, big plays)",
      "Counterfactual simulation: &quot;what if pass to X instead?&quot;",
    ],
  },
  "scenario-editor": {
    title: "Scenario Editor",
    bullets: [
      "Create custom game scenarios and situations",
      "Test different decision outcomes and their EPV impact",
      "Compare multiple tactical approaches side-by-side",
    ],
  },
};

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("live-board");

  // Replay tab state
  const [matchIds, setMatchIds] = useState<string[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const [moments, setMoments] = useState<Moment[]>([]);
  const [selectedMoment, setSelectedMoment] = useState<Moment | null>(null);
  const [windowFrames, setWindowFrames] = useState<any[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [loadingMoments, setLoadingMoments] = useState(false);
  const [loadingWindow, setLoadingWindow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch matches on mount and when refresh is clicked
  const fetchMatches = async () => {
    setLoadingMatches(true);
    setError(null);
    try {
      const response = await apiGet<MatchesResponse>("/replay/matches");
      const ids = response.match_ids || [];
      setMatchIds(ids);
      if (ids.length > 0 && !selectedMatchId) {
        setSelectedMatchId(ids[0]);
      }
    } catch (e) {
      setError(`Failed to fetch matches: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingMatches(false);
    }
  };

  // Fetch moments when match_id changes
  useEffect(() => {
    if (selectedMatchId) {
      setLoadingMoments(true);
      setError(null);
      setMoments([]);
      setSelectedMoment(null);
      setWindowFrames([]);
      apiGet<MomentsResponse>(`/replay/${selectedMatchId}/moments?limit=50`)
        .then((response) => {
          const momentsList = response.moments || [];
          setMoments(momentsList);
          if (momentsList.length > 0) {
            setSelectedMoment(momentsList[0]);
          }
        })
        .catch((e) => {
          setError(
            `Failed to fetch moments for ${selectedMatchId}: ${e instanceof Error ? e.message : String(e)}`
          );
        })
        .finally(() => {
          setLoadingMoments(false);
        });
    }
  }, [selectedMatchId]);

  // Fetch window when moment is selected
  useEffect(() => {
    if (selectedMatchId && selectedMoment) {
      // Use start_frame/end_frame from moment, or calculate from center_frame
      let startFrame: number;
      let endFrame: number;

      if (selectedMoment.start_frame != null && selectedMoment.end_frame != null) {
        startFrame = selectedMoment.start_frame;
        endFrame = selectedMoment.end_frame;
      } else if (selectedMoment.center_frame != null) {
        const radius = 50;
        startFrame = Math.max(0, selectedMoment.center_frame - radius);
        endFrame = selectedMoment.center_frame + radius;
      } else {
        // Fallback: can't fetch without frame info
        setError("Moment has no frame information available");
        setWindowFrames([]);
        setLoadingWindow(false);
        return;
      }

      setLoadingWindow(true);
      setError(null);
      apiGet<WindowResponse>(
        `/replay/${selectedMatchId}/window?start_frame=${startFrame}&end_frame=${endFrame}`
      )
        .then((response) => {
          setWindowFrames(response.frames || []);
        })
        .catch((e) => {
          const errorMsg = e instanceof Error ? e.message : String(e);
          setError(`Failed to fetch window: ${errorMsg}`);
          setWindowFrames([]);
        })
        .finally(() => {
          setLoadingWindow(false);
        });
    }
  }, [selectedMatchId, selectedMoment]);

  // Load matches when Replay tab becomes active
  useEffect(() => {
    if (activeTab === "replay" && matchIds.length === 0 && !loadingMatches) {
      fetchMatches();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const renderReplayTab = () => {
    return (
      <div className="space-y-6">
        {/* Top row: Match selector and Refresh */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <label htmlFor="match-select" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Match
            </label>
            <select
              id="match-select"
              value={selectedMatchId}
              onChange={(e) => setSelectedMatchId(e.target.value)}
              disabled={loadingMatches || matchIds.length === 0}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-zinc-600"
            >
              {matchIds.length === 0 ? (
                <option value="">No matches available</option>
              ) : (
                matchIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))
              )}
            </select>
            <button
              onClick={fetchMatches}
              disabled={loadingMatches}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {loadingMatches ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Error callout */}
        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Two-column layout: Moments list and Preview Window */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left column: Moments list */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
              Moments
            </h3>
            {loadingMoments ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800"
                  />
                ))}
              </div>
            ) : moments.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No moments available. Select a match to load moments.
              </p>
            ) : (
              <div className="max-h-[600px] space-y-2 overflow-y-auto">
                {moments.map((moment) => {
                  const isSelected = selectedMoment?.index === moment.index;
                  const hasOpponent = moment.opponent_team_name || moment.opponent_player_name;
                  
                  return (
                    <button
                      key={moment.index}
                      onClick={() => setSelectedMoment(moment)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        isSelected
                          ? "border-zinc-400 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800"
                          : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <div className="font-medium text-zinc-900 dark:text-white">
                        {(moment.event_type || "UNKNOWN EVENT").toUpperCase()} — {moment.team_name || "Unknown Team"}
                        {hasOpponent && (
                          <span className="ml-1 text-zinc-600 dark:text-zinc-400">
                            vs {moment.opponent_team_name || moment.opponent_player_name || "Opponent"}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        P{moment.period ?? "?"} • t={moment.time_seconds?.toFixed(1) ?? "?"}s
                        {moment.player_name && ` • ${moment.player_name}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right column: Preview Window */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
              Preview Window
            </h3>
            {loadingWindow ? (
              <div className="space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              </div>
            ) : !selectedMoment ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Select a moment to preview tracking data.
              </p>
            ) : windowFrames.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No frames available for this moment.
              </p>
            ) : selectedMoment ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
                  <div className="space-y-2 text-sm">
                    <div className="font-medium text-zinc-900 dark:text-white">
                      Frames loaded: {windowFrames.length}
                    </div>
                    <div className="text-zinc-600 dark:text-zinc-400">
                      Range: {selectedMoment.start_frame ?? "?"} → {selectedMoment.end_frame ?? "?"}
                    </div>
                  </div>
                </div>
                {windowFrames.length > 0 && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
                    <div className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      First frame preview:
                    </div>
                    <pre className="max-h-64 overflow-auto rounded bg-zinc-100 p-2 text-xs font-mono text-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                      {JSON.stringify(windowFrames[0], null, 2).slice(0, 500)}
                      {JSON.stringify(windowFrames[0], null, 2).length > 500 && "..."}
                    </pre>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Container>
      <div className="py-16">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Interactive EPV Dashboard
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Analyze possession value, simulate decisions, and replay match moments.
        </p>

        <div className="mt-12">
          <div className="border-b border-zinc-200 dark:border-zinc-800">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
                    ${
                      activeTab === tab.id
                        ? "border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
                        : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-500 dark:hover:border-zinc-700 dark:hover:text-zinc-300"
                    }
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="mt-8">
            {activeTab === "replay" ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
                {renderReplayTab()}
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                  {tabContent[activeTab].title}
                </h2>
                <ul className="mt-4 space-y-2 list-disc list-inside pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                  {tabContent[activeTab].bullets.map((bullet, index) => (
                    <li key={index}>{bullet}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </Container>
  );
}
