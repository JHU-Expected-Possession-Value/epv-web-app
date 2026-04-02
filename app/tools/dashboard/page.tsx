"use client";

import { useEffect, useRef, useState } from "react";
import Container from "@/components/Container";
import {
  fetchLiveEval,
  fetchLiveFrame,
  fetchLiveMatches,
  fetchLiveRange,
  fetchLiveRoster,
  fetchRecommend,
  fetchReplayMatches,
  fetchReplayMoments,
  fetchResimulate,
  fetchTrackingWindowRender,
  type LiveEvalResponse,
  type LiveMatchInfo,
  type LiveRosterPlayer,
  type ReplayMatch,
  type ReplayMoment,
  type RecommendResponse,
  type ReplayTrackingWindowResponse,
  type RenderFrame,
  type ResimulateOptionAResponse,
  type TrackingRenderWindow,
} from "@/lib/api";
import TacticsBoard from "@/components/tactics/TacticsBoard";
import PitchRenderer from "@/components/replay/PitchRenderer";

const PLAYBACK_TARGET_FPS = 30;
const SPEED_OPTIONS = [0.25, 0.5, 1, 2] as const;

type Tab = "tactical-board" | "replay" | "scenario-editor";

const tabs: { id: Tab; label: string }[] = [
  { id: "tactical-board", label: "Tactical Board" },
  { id: "replay", label: "Replay" },
  { id: "scenario-editor", label: "Scenario Editor" },
];

// TypeScript types for API responses
type Match = ReplayMatch;
type Moment = ReplayMoment;
type WindowResponse = ReplayTrackingWindowResponse;

const tabContent: Record<Tab, { title: string; bullets: string[] }> = {
  "tactical-board": {
    title: "Tactical Board",
    bullets: [
      "Sandbox tactics board with EPV decisions",
      "Drag players to explore positioning and spacing",
      "See best action arrows for passes, dribbles, and shots",
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
  const [activeTab, setActiveTab] = useState<Tab>("tactical-board");

  // Replay tab state
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const [moments, setMoments] = useState<Moment[]>([]);
  const [selectedMoment, setSelectedMoment] = useState<Moment | null>(null);
  const [trackingWindow, setTrackingWindow] = useState<WindowResponse | null>(
    null
  );
  const [trackingRenderWindow, setTrackingRenderWindow] =
    useState<TrackingRenderWindow | null>(null);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [loadingMoments, setLoadingMoments] = useState(false);
  const [loadingMoreMoments, setLoadingMoreMoments] = useState(false);
  const [loadingWindow, setLoadingWindow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowError, setWindowError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  // Separate frame index per mode so switching tabs preserves position
  const [originalFrameIndex, setOriginalFrameIndex] = useState(0);
  const [recommendedFrameIndex, setRecommendedFrameIndex] = useState(0);

  // Client-side cache for render windows keyed by (match_id, center_frame)
  const renderCacheRef = useRef<Record<string, TrackingRenderWindow>>({});

  const MOMENTS_LIMIT = 200;
  const [momentsCount, setMomentsCount] = useState(0);
  const [momentsOffset, setMomentsOffset] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const playbackRef = useRef<{ lastTime: number; acc: number }>({ lastTime: 0, acc: 0 });
  const [momentsDedupeDebug, setMomentsDedupeDebug] = useState<ReplayMomentsResponse["dedupe_debug"] | null>(null);
  const isDev = process.env.NODE_ENV !== "production";

  // Replay mode: "original" | "recommended"
  const [replayMode, setReplayMode] = useState<"original" | "recommended">(
    "original"
  );
  // Original window frames (from GET tracking_window_render when moment is selected)
  const originalFrames: RenderFrame[] = trackingRenderWindow?.frames ?? [];
  // Recommended: from POST recommend + POST resimulate for current moment
  const [recommendResponse, setRecommendResponse] = useState<RecommendResponse | null>(null);
  const [recommendedFrames, setRecommendedFrames] = useState<RenderFrame[]>([]);
  const [loadingResimulate, setLoadingResimulate] = useState(false);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [resimMeta, setResimMeta] = useState<ResimulateOptionAResponse["meta"] | null>(null);

  // Fetch matches on mount and when refresh is clicked
  const fetchMatches = async () => {
    setLoadingMatches(true);
    setError(null);
    try {
      const response = await fetchReplayMatches();
      const ms = response.matches || [];
      setMatches(ms);
      if (ms.length > 0 && !selectedMatchId) {
        setSelectedMatchId(ms[0].match_id);
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
      setTrackingWindow(null);
      setTrackingRenderWindow(null);
      setWindowError(null);
      setIsPlaying(false);
      setOriginalFrameIndex(0);
      setRecommendedFrameIndex(0);
      setReplayMode("original");
      setRecommendResponse(null);
      setRecommendedFrames([]);
      setResimMeta(null);
      setMomentsOffset(0);

      fetchReplayMoments(selectedMatchId, MOMENTS_LIMIT, 0, isDev && momentsDedupeDebug !== null)
        .then((response) => {
          const momentsList = response.moments || [];
          setMoments(momentsList);
          setMomentsCount(response.count ?? momentsList.length);
          if (isDev) {
            setMomentsDedupeDebug(response.dedupe_debug ?? null);
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
  }, [selectedMatchId, MOMENTS_LIMIT]);

  const loadMoreMoments = async () => {
    if (!selectedMatchId || loadingMoreMoments) return;
    const nextOffset = momentsOffset + MOMENTS_LIMIT;
    setLoadingMoreMoments(true);
    try {
      const res = await fetchReplayMoments(selectedMatchId, MOMENTS_LIMIT, nextOffset, false);
      const more = res.moments || [];
      setMoments((prev) => [...prev, ...more]);
      setMomentsOffset(nextOffset);
    } catch (e) {
      setError(
        `Failed to load more moments: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setLoadingMoreMoments(false);
    }
  };

  // Fetch tracking window only when a moment is clicked (no prefetch for all moments).
  // Reuse cached window if the same moment is clicked again.
  useEffect(() => {
    if (selectedMatchId && selectedMoment) {
      const centerFrame = selectedMoment.frame_end ?? selectedMoment.frame;
      const cacheKey = `${selectedMatchId}:${centerFrame}`;
      const cached = renderCacheRef.current[cacheKey];

      setReplayMode("original");
      setWindowError(null);
      setIsPlaying(false);
      setRecommendResponse(null);
      setRecommendedFrames([]);
      setRecommendError(null);
      setOriginalFrameIndex(0);
      setRecommendedFrameIndex(0);

      if (cached) {
        setTrackingRenderWindow(cached);
        const frames = cached.frames || [];
        const effectiveCenter =
          cached.effective_center_frame ?? cached.center_frame;
        if (frames.length > 0) {
          const centerIdx = frames.findIndex(
            (f) => f.frame === effectiveCenter
          );
          setOriginalFrameIndex(centerIdx >= 0 ? centerIdx : 0);
        }
        setLoadingWindow(false);
        return;
      }

      setLoadingWindow(true);
      setTrackingRenderWindow(null);

      const handle = setTimeout(() => {
        // GET /replay/tracking_window_render → originalFrames for this moment
        fetchTrackingWindowRender(selectedMatchId, centerFrame, 60, 1, 120)
          .then((response) => {
            renderCacheRef.current[cacheKey] = response;
            setTrackingRenderWindow(response);
            setWindowError(null);
            const frames = response.frames || [];
            const effectiveCenter =
              response.effective_center_frame ?? response.center_frame;
            if (frames.length > 0) {
              const centerIdx = frames.findIndex(
                (f) => f.frame === effectiveCenter
              );
              setOriginalFrameIndex(centerIdx >= 0 ? centerIdx : 0);
            }
          })
          .catch((e) => {
            const errorMsg = e instanceof Error ? e.message : String(e);
            setWindowError(errorMsg);
            setTrackingRenderWindow(null);
          })
          .finally(() => {
            setLoadingWindow(false);
          });
      }, 150);

      return () => clearTimeout(handle);
    }
  }, [selectedMatchId, selectedMoment]);

  // Load matches when Replay tab becomes active
  useEffect(() => {
    if (activeTab === "replay" && matches.length === 0 && !loadingMatches) {
      fetchMatches();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Live Board tab is now a pure tactics sandbox (no live match frames),
  // rendered via TacticsBoard. All Live Board-specific state and effects
  // have been removed from this page; TacticsBoard manages its own state.

  const handleReplayRecommended = async () => {
    if (!selectedMatchId || !selectedMoment) return;
    setRecommendError(null);
    setLoadingResimulate(true);
    setError(null);
    try {
      const centerFrame = selectedMoment.frame_end ?? selectedMoment.frame;
      const recommend = await fetchRecommend(
        selectedMatchId,
        selectedMoment.moment_id,
        centerFrame,
        selectedMoment.event_type ?? undefined,
        (selectedMoment as { loser_side?: string }).loser_side ?? undefined,
        undefined
      );
      setRecommendResponse(recommend);
      const action = (recommend.recommendation.action === "carry_to_space"
        ? "carry_to_space"
        : "short_safe_pass") as "short_safe_pass" | "carry_to_space";
      const recommendation = {
        action,
        target_player_id: recommend.recommendation.target_player_id ?? recommend.recommendation.target?.player_id ?? null,
        target_point: recommend.recommendation.target_point ?? (recommend.overlay?.to ? { x: recommend.overlay.to.x, y: recommend.overlay.to.y } : null),
      };
      const resim = await fetchResimulate(
        selectedMatchId,
        centerFrame,
        recommendation,
        60,
        90
      );
      setRecommendedFrames(resim.resimulated?.frames ?? []);
      setResimMeta(resim.meta);
      setRecommendedFrameIndex(0);
      setReplayMode("recommended");
      setIsPlaying(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRecommendError(msg);
      setReplayMode("original");
      setRecommendedFrames([]);
      setRecommendResponse(null);
      setResimMeta(null);
    } finally {
      setLoadingResimulate(false);
    }
  };

  const handleReplayOriginal = () => {
    setReplayMode("original");
    setIsPlaying(false);
    if (trackingRenderWindow?.frames?.length) {
      const center =
        trackingRenderWindow.effective_center_frame ?? trackingRenderWindow.center_frame;
      const idx = trackingRenderWindow.frames.findIndex((f) => f.frame === center);
      setOriginalFrameIndex(idx >= 0 ? idx : 0);
    }
  };

  // Playback: one timeline per mode; use the active mode's frames and index
  const playbackFrames: RenderFrame[] =
    replayMode === "recommended" ? recommendedFrames : originalFrames;
  const currentFrameIndex =
    replayMode === "original" ? originalFrameIndex : recommendedFrameIndex;
  const setCurrentFrameIndex =
    replayMode === "original" ? setOriginalFrameIndex : setRecommendedFrameIndex;

  const playbackStartFrame =
    playbackFrames.length > 0 ? playbackFrames[0].frame : 0;
  const playbackEndFrame =
    playbackFrames.length > 0
      ? playbackFrames[playbackFrames.length - 1].frame
      : 0;

  // Playback: requestAnimationFrame, decoupled draw (rAF runs every frame) from frame-index step (every 1/(30*speed) sec)
  const playbackFramesRef = useRef(playbackFrames);
  playbackFramesRef.current = playbackFrames;
  const replayModeRef = useRef(replayMode);
  replayModeRef.current = replayMode;
  const playbackSpeedRef = useRef(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;

  useEffect(() => {
    if (!isPlaying || playbackFrames.length === 0) return;
    let rafId = 0;
    playbackRef.current = { lastTime: performance.now(), acc: 0 };

    const tick = (now: number) => {
      const prev = playbackRef.current;
      const dt = Math.min(now - prev.lastTime, 100);
      playbackRef.current.lastTime = now;
      const speed = playbackSpeedRef.current;
      const frameInterval = 1000 / (PLAYBACK_TARGET_FPS * speed);
      playbackRef.current.acc += dt;
      const frames = playbackFramesRef.current;
      while (playbackRef.current.acc >= frameInterval && frames.length > 0) {
        playbackRef.current.acc -= frameInterval;
        if (replayModeRef.current === "original") {
          setOriginalFrameIndex((idx) =>
            idx + 1 < frames.length ? idx + 1 : idx
          );
        } else {
          setRecommendedFrameIndex((idx) =>
            idx + 1 < frames.length ? idx + 1 : idx
          );
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, playbackSpeed, replayMode]);

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
              disabled={loadingMatches || matches.length === 0}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm transition-colors focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-zinc-600"
              >
              {matches.length === 0 ? (
                <option value="">No matches available</option>
              ) : (
                matches.map((m) => (
                  <option key={m.match_id} value={m.match_id}>
                    {m.label}
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
              Moments ({momentsCount > 0 ? momentsCount : moments.length})
            </h3>
            {isDev && momentsDedupeDebug && momentsDedupeDebug.length > 0 && (
              <div className="mb-3 rounded-md border border-zinc-300 bg-zinc-50 p-2 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300">
                <div className="mb-1 font-medium text-zinc-700 dark:text-zinc-200">
                  Dedupe (first {momentsDedupeDebug.length} removed)
                </div>
                <ul className="space-y-0.5">
                  {momentsDedupeDebug.map((d, i) => (
                    <li key={i}>
                      <span className="font-mono text-[10px] text-zinc-500">{d.reason}</span>{" "}
                      {d.event_type_group && <span>{d.event_type_group}</span>}
                      {typeof d.game_time_seconds === "number" && (
                        <span className="text-zinc-500"> @ {d.game_time_seconds.toFixed(1)}s</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
                  const isSelected =
                    selectedMoment?.moment_id === moment.moment_id;
                  const match = matches.find(
                    (m) => m.match_id === selectedMatchId
                  );
                  const homeAway =
                    match && moment.team_id != null
                      ? moment.team_id === match.home_team?.id
                        ? "Home"
                        : moment.team_id === match.away_team?.id
                          ? "Away"
                          : null
                      : null;
                  const teamLabel = moment.team_shortname ?? "Team";
                  const teamWithSide =
                    homeAway ? `${teamLabel} (${homeAway})` : teamLabel;
                  const timeLabel = moment.time_label ?? "--:--";
                  const playerName = moment.player_name ?? "Unknown player";
                  const turnoverLabel =
                    moment.turnover_type ?? moment.event_type ?? "Turnover";
                  const eventDetail = [moment.event_type, moment.event_subtype]
                    .filter(Boolean)
                    .join(" / ");
                  return (
                    <button
                      key={moment.moment_id}
                      onClick={() => setSelectedMoment(moment)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        isSelected
                          ? "border-zinc-400 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800"
                          : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="shrink-0 font-mono text-sm font-medium text-zinc-700 dark:text-zinc-300">
                              {timeLabel}
                            </span>
                            <span className="truncate font-medium text-zinc-900 dark:text-white">
                              {teamWithSide}
                            </span>
                          </div>
                          <div className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                            {playerName}
                          </div>
                          <div className="mt-0.5">
                            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                              {turnoverLabel}
                            </span>
                            {eventDetail ? (
                              <div className="text-[11px] text-zinc-500 dark:text-zinc-500">
                                {eventDetail}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-[11px] text-zinc-500 dark:text-zinc-400">
                          P{moment.period ?? "?"}
                        </div>
                      </div>
                    </button>
                  );
                })}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={loadMoreMoments}
                    disabled={loadingMoreMoments || loadingMoments}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    {loadingMoreMoments ? "Loading…" : "Load more"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right column: Preview Window — minimal padding so pitch is as large as possible */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-white">
              Preview Window
            </h3>
            {loadingWindow ? (
              <div className="space-y-2 text-sm text-zinc-500 dark:text-zinc-400">
                <div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                <p>Loading tracking…</p>
              </div>
            ) : !selectedMoment ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Select a moment to preview tracking data.
              </p>
            ) : windowError ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                Could not load preview: {windowError}
              </div>
            ) : !trackingRenderWindow ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No tracking data for this moment.
              </p>
            ) : trackingRenderWindow.frames.length === 0 ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No frames available for this moment.
                </p>
              </div>
            ) : selectedMoment && trackingRenderWindow ? (
              <div className="space-y-4">
                {/* Replay Original / Replay Recommended */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReplayOriginal}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      replayMode === "original"
                        ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500"
                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    }`}
                  >
                    Replay Original
                  </button>
                  <button
                    type="button"
                    onClick={handleReplayRecommended}
                    disabled={loadingResimulate}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                      replayMode === "recommended"
                        ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500"
                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {loadingResimulate
                      ? "Loading..."
                      : "Replay Recommended"}
                  </button>
                </div>

                {/* Error toast when recommended load failed */}
                {recommendError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200"
                  >
                    Recommended failed: {recommendError}. Showing original frames.
                  </div>
                )}

                {/* Summary: "Instead of X do Y, EPV Δ: …" when Recommended active */}
                {replayMode === "recommended" && recommendResponse && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                    <div className="text-sm font-medium text-zinc-900 dark:text-white">
                      {recommendResponse.recommendation.summary ?? recommendResponse.recommendation.text}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                      EPV Δ: {recommendResponse.epv.epv_delta >= 0 ? "+" : ""}
                      {recommendResponse.epv.epv_delta.toFixed(3)}
                    </div>
                  </div>
                )}
                {replayMode === "recommended" && !recommendResponse && !loadingResimulate && recommendedFrames.length === 0 && !recommendError && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">
                      Click Replay Recommended to load synthetic sequence.
                    </div>
                  </div>
                )}

                {(() => {
                  const selectedMatch = matches.find(
                    (m) => m.match_id === selectedMatchId
                  );
                  const frames = playbackFrames;
                  const clampedIndex =
                    frames.length === 0
                      ? 0
                      : Math.min(
                          Math.max(currentFrameIndex, 0),
                          frames.length - 1
                        );
                  const rawFrame = frames[clampedIndex];
                  let lastValidBall = rawFrame?.ball ?? null;
                  for (let i = clampedIndex - 1; i >= 0; i--) {
                    const b = frames[i]?.ball;
                    if (b && b.x != null && b.y != null) {
                      lastValidBall = b;
                      break;
                    }
                  }
                  const ballForFrame =
                    rawFrame?.ball && rawFrame.ball.x != null && rawFrame.ball.y != null
                      ? rawFrame.ball
                      : lastValidBall;
                  const currentFrame: RenderFrame | null = rawFrame
                    ? { ...rawFrame, ball: ballForFrame ?? rawFrame.ball }
                    : null;
                  const frameNumber = currentFrame?.frame ?? null;
                  const isCenter =
                    replayMode === "original" &&
                    trackingRenderWindow != null &&
                    frameNumber != null &&
                    frameNumber ===
                      (trackingRenderWindow.effective_center_frame ??
                        trackingRenderWindow.center_frame);
                  const effectiveCenter =
                    trackingRenderWindow?.effective_center_frame;
                  const showAdjustedNote =
                    replayMode === "original" &&
                    effectiveCenter != null &&
                    trackingRenderWindow != null &&
                    effectiveCenter !== trackingRenderWindow.center_frame;
                  const highlightId =
                    currentFrame?.derived_possession?.player_id ??
                    (replayMode === "recommended" && recommendResponse
                      ? recommendResponse.recommendation.target_player_id ??
                        recommendResponse.chosen_target_player_id ??
                        recommendResponse.recommendation.target?.player_id ??
                        null
                      : null);

                  // EPV overlays in recommended mode using backend teammate_overlays
                  const teammateValues =
                    replayMode === "recommended" &&
                    recommendResponse &&
                    Array.isArray(recommendResponse.teammate_overlays)
                      ? recommendResponse.teammate_overlays.map((o) => ({
                          player_id: o.player_id,
                          value: o.epv_value,
                        }))
                      : [];

                  const highlightTeammateId =
                    replayMode === "recommended" && recommendResponse
                      ? recommendResponse.recommendation.target_player_id ??
                        recommendResponse.chosen_target_player_id ??
                        recommendResponse.recommendation.target?.player_id ??
                        null
                      : null;

                  return (
                    <>
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
                        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="font-medium text-zinc-900 dark:text-white">
                              {replayMode === "recommended"
                                ? `Recommended: ${frames.length} frames`
                                : `Frames loaded: ${frames.length}`}
                            </div>
                            <div className="text-zinc-600 dark:text-zinc-400">
                              {replayMode === "recommended"
                                ? `Range: ${playbackStartFrame} → ${playbackEndFrame}`
                                : `Range: ${trackingRenderWindow?.start_frame ?? "—"} → ${trackingRenderWindow?.end_frame ?? "—"}`}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setIsPlaying((p) => !p)}
                              className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                            >
                              {isPlaying ? "Pause" : "Play"}
                            </button>
                            <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                              Speed
                              <select
                                value={playbackSpeed}
                                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                                className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                              >
                                {SPEED_OPTIONS.map((s) => (
                                  <option key={s} value={s}>{s}x</option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                          <span>Frame {clampedIndex + 1} / {frames.length}</span>
                          {currentFrame?.timestamp && (
                            <span>· {currentFrame.timestamp}</span>
                          )}
                        </div>
                        <div className="mt-2">
                          <input
                            type="range"
                            min={0}
                            max={Math.max(frames.length - 1, 0)}
                            value={clampedIndex}
                            onChange={(e) => {
                              setIsPlaying(false);
                              setCurrentFrameIndex(Number(e.target.value));
                            }}
                            className="h-1 w-full cursor-pointer accent-emerald-500"
                          />
                        </div>
                      </div>
                      {/* Pitch header: P<period> • <clock> or Frame <frame> */}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-zinc-900 dark:text-white">
                          {currentFrame?.timestamp
                            ? `P${currentFrame.period ?? "?"} • ${currentFrame.timestamp}`
                            : `Frame ${frameNumber ?? "?"}`}
                        </div>
                        {isCenter && (
                          <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            center
                          </span>
                        )}
                        {showAdjustedNote && (
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            Adjusted to nearest valid frame.
                          </span>
                        )}
                        {replayMode === "recommended" && selectedMoment && (
                          <span className="rounded border border-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500">
                            Resimulated from frame {selectedMoment.frame_end ?? selectedMoment.frame}
                          </span>
                        )}
                      </div>
                      {/* Recommended info panel */}
                      {replayMode === "recommended" && recommendResponse && (
                        <div className="mt-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100">
                          <div className="font-semibold text-emerald-300">
                            {recommendResponse.recommendation.text}
                          </div>
                          {highlightTeammateId != null && (
                            <div className="mt-0.5 text-emerald-200">
                              Recommended pass target: player {highlightTeammateId}
                            </div>
                          )}
                          {recommendResponse.fallback_reason && recommendResponse.recommendation.action !== "short_safe_pass" && (
                            <div className="mt-0.5 text-amber-200">
                              Fallback: carry into space (reason: {recommendResponse.fallback_reason})
                            </div>
                          )}
                        </div>
                      )}
                      <div className="mt-3 w-full min-w-0">
                        <PitchRenderer
                          frame={currentFrame ?? null}
                          home_team_id={selectedMatch?.home_team?.id ?? null}
                          away_team_id={selectedMatch?.away_team?.id ?? null}
                          highlightPlayerId={highlightId}
                          teammateValues={teammateValues}
                          highlightTeammateId={highlightTeammateId}
                          className="w-full min-h-[260px]"
                        />
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const renderLiveBoardTab = () => {
    return (
      <div className="space-y-4">
        <TacticsBoard />
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
            {activeTab === "tactical-board" ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
                {renderLiveBoardTab()}
              </div>
            ) : activeTab === "replay" ? (
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
