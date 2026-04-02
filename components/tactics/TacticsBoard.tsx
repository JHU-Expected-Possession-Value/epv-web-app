"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PITCH_HOME_COLOR, PITCH_AWAY_COLOR } from "@/components/replay/PitchRenderer";
import {
  fetchPlayerThreatHeatmap,
  fetchTacticsRecommendation,
  fetchTacticsRoster,
  type PlayerThreatHeatmapResponse,
  type TacticsPlayerIn,
  type TacticsRecommendationRequest,
  type TacticsRecommendationResponse,
  type TacticsRosterPlayer,
} from "@/lib/api";

type TacticsPlayerState = {
  id: string;
  name: string;
  team: "home" | "away";
  position: string;
  x: number;
  y: number;
};

const HOME_COLOR = PITCH_HOME_COLOR;
const AWAY_COLOR = PITCH_AWAY_COLOR;

const PITCH_X_MIN = -52.5;
const PITCH_X_MAX = 52.5;
const PITCH_Y_MIN = -34;
const PITCH_Y_MAX = 34;
const PITCH_LENGTH = PITCH_X_MAX - PITCH_X_MIN;
const PITCH_WIDTH = PITCH_Y_MAX - PITCH_Y_MIN;

/** Preset shapes for the attacking (home) side; coordinates match API pitch bounds. */
const FORMATIONS = {
  balanced: {
    label: "4-3-3",
    slots: [
      { x: -38, y: -18 },
      { x: -38, y: -6 },
      { x: -38, y: 6 },
      { x: -38, y: 18 },
      { x: -18, y: -14 },
      { x: -18, y: 0 },
      { x: -18, y: 14 },
      { x: 8, y: -16 },
      { x: 8, y: 0 },
      { x: 8, y: 16 },
    ],
  },
  narrow442: {
    label: "4-4-2 (compact)",
    slots: [
      { x: -38, y: -18 },
      { x: -38, y: -6 },
      { x: -38, y: 6 },
      { x: -38, y: 18 },
      { x: -20, y: -18 },
      { x: -20, y: -6 },
      { x: -20, y: 6 },
      { x: -20, y: 18 },
      { x: 12, y: -8 },
      { x: 12, y: 8 },
    ],
  },
  wide352: {
    label: "3-5-2",
    slots: [
      { x: -40, y: -12 },
      { x: -40, y: 0 },
      { x: -40, y: 12 },
      { x: -18, y: -20 },
      { x: -18, y: -10 },
      { x: -18, y: 0 },
      { x: -18, y: 10 },
      { x: -18, y: 20 },
      { x: 14, y: -8 },
      { x: 14, y: 8 },
    ],
  },
  low_block: {
    label: "Low block",
    slots: [
      { x: -42, y: -18 },
      { x: -42, y: -6 },
      { x: -42, y: 6 },
      { x: -42, y: 18 },
      { x: -28, y: -16 },
      { x: -28, y: 0 },
      { x: -28, y: 16 },
      { x: -14, y: -12 },
      { x: -14, y: 12 },
      { x: -2, y: 0 },
    ],
  },
} as const;

type FormationKey = keyof typeof FORMATIONS;

function clampPitch(x: number, y: number) {
  return {
    x: Math.max(PITCH_X_MIN, Math.min(PITCH_X_MAX, x)),
    y: Math.max(PITCH_Y_MIN, Math.min(PITCH_Y_MAX, y)),
  };
}

function spreadAwayPositions(count: number): { x: number; y: number }[] {
  const xStart = -20;
  const xEnd = 30;
  const xs = Array.from({ length: count }, (_, i) =>
    xStart + ((xEnd - xStart) * (i + 1)) / (count + 1)
  );
  const yRow = [-20, -7, 7, 20];
  return xs.map((x, i) => ({ x, y: yRow[i % yRow.length] }));
}

function placeHomeFromRoster(
  homeRaw: TacticsRosterPlayer[],
  formationKey: FormationKey
): TacticsPlayerState[] {
  const slots = FORMATIONS[formationKey].slots;
  const n = Math.min(homeRaw.length, slots.length);
  return homeRaw.slice(0, n).map((p, i) => ({
    id: String(p.player_id),
    name: `${p.name} (${p.team}) — ${p.position}`,
    team: "home" as const,
    position: p.position,
    x: slots[i]?.x ?? -10,
    y: slots[i]?.y ?? 0,
  }));
}

function placeAwayFromRoster(awayRaw: TacticsRosterPlayer[]): TacticsPlayerState[] {
  const layout = spreadAwayPositions(awayRaw.length);
  return awayRaw.map((p, i) => ({
    id: String(p.player_id),
    name: `${p.name} (${p.team}) — ${p.position}`,
    team: "away" as const,
    position: p.position,
    x: layout[i]?.x ?? 10,
    y: layout[i]?.y ?? 0,
  }));
}

function worldToSvg(wx: number, wy: number): { x: number; y: number } {
  const sx = ((wx - PITCH_X_MIN) / PITCH_LENGTH) * 105;
  const sy = ((PITCH_Y_MAX - wy) / PITCH_WIDTH) * 68;
  return { x: sx, y: sy };
}

function ThreatHeatCells({
  heatmap,
}: {
  heatmap: PlayerThreatHeatmapResponse;
}) {
  const { cols, rows, cells } = heatmap;
  const dx = PITCH_LENGTH / cols;
  const dy = PITCH_WIDTH / rows;
  return (
    <g className="pointer-events-none" aria-hidden>
      {cells.map((c) => {
        const wx0 = PITCH_X_MIN + c.col * dx;
        const wx1 = PITCH_X_MIN + (c.col + 1) * dx;
        const wyLo = PITCH_Y_MIN + c.row * dy;
        const wyHi = PITCH_Y_MIN + (c.row + 1) * dy;
        const top = worldToSvg(wx0, wyHi);
        const br = worldToSvg(wx1, wyLo);
        const w = br.x - top.x;
        const h = br.y - top.y;
        const alpha = 0.08 + c.intensity * 0.42;
        return (
          <rect
            key={`${c.col}-${c.row}`}
            x={top.x}
            y={top.y}
            width={w}
            height={h}
            fill={`rgba(251, 191, 36, ${alpha})`}
            stroke="none"
          />
        );
      })}
    </g>
  );
}

export default function TacticsBoard() {
  const [roster, setRoster] = useState<TacticsRosterPlayer[]>([]);
  const [rosterEpoch, setRosterEpoch] = useState(0);
  const [homePlayers, setHomePlayers] = useState<TacticsPlayerState[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<TacticsPlayerState[]>([]);
  const [ballCarrierId, setBallCarrierId] = useState<string | null>(null);
  const [homeTeamName, setHomeTeamName] = useState<string>("");
  const [formationKey, setFormationKey] = useState<FormationKey>("balanced");
  const [showThreatHeatmap, setShowThreatHeatmap] = useState(false);
  const [threatHeatmap, setThreatHeatmap] = useState<PlayerThreatHeatmapResponse | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<TacticsRecommendationResponse | null>(null);
  const [loadingRec, setLoadingRec] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<{ id: string | null }>({ id: null });
  const dragPendingRef = useRef<{ id: string | null; x: number; y: number } | null>(null);
  const recDebounceRef = useRef<number | null>(null);
  const requestSeqRef = useRef(0);
  const homePlayersRef = useRef(homePlayers);
  const awayPlayersRef = useRef(awayPlayers);
  const ballCarrierIdRef = useRef(ballCarrierId);
  const rosterRef = useRef(roster);

  useEffect(() => {
    homePlayersRef.current = homePlayers;
  }, [homePlayers]);
  useEffect(() => {
    awayPlayersRef.current = awayPlayers;
  }, [awayPlayers]);
  useEffect(() => {
    ballCarrierIdRef.current = ballCarrierId;
  }, [ballCarrierId]);
  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  const runRecommendation = useCallback(() => {
    const hp = homePlayersRef.current;
    const ap = awayPlayersRef.current;
    const bcid = ballCarrierIdRef.current;
    const r = rosterRef.current;
    const ballCarrier = hp.find((p) => p.id === bcid) ?? hp[0] ?? null;
    if (!ballCarrier) return;
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    const rosterRow = r.find((row) => String(row.player_id) === ballCarrier.id);
    const payload: TacticsRecommendationRequest = {
      ball_carrier: {
        player_id: ballCarrier.id,
        x: ballCarrier.x,
        y: ballCarrier.y,
        team: "home",
        pass_skill: rosterRow?.pass_skill ?? 1.0,
        dribble_skill: rosterRow?.dribble_skill ?? 1.0,
        shot_skill: rosterRow?.shot_skill ?? 1.0,
      },
      home: hp.map<TacticsPlayerIn>((p) => ({
        player_id: p.id,
        x: p.x,
        y: p.y,
        pos: p.position,
      })),
      away: ap.map<TacticsPlayerIn>((p) => ({
        player_id: p.id,
        x: p.x,
        y: p.y,
        pos: p.position,
      })),
    };
    setLoadingRec(true);
    setError(null);
    fetchTacticsRecommendation(payload)
      .then((res) => {
        if (requestSeqRef.current === seq) {
          setRecommendation(res);
        }
      })
      .catch((e) => {
        if (requestSeqRef.current === seq) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (requestSeqRef.current === seq) {
          setLoadingRec(false);
        }
      });
  }, []);

  const scheduleRecommendation = useCallback(() => {
    if (recDebounceRef.current !== null) {
      window.clearTimeout(recDebounceRef.current);
    }
    recDebounceRef.current = window.setTimeout(() => {
      recDebounceRef.current = null;
      runRecommendation();
    }, 150);
  }, [runRecommendation]);

  useEffect(() => {
    fetchTacticsRoster()
      .then((data) => {
        setRoster(data);
        const teamCodes = Array.from(new Set(data.map((p) => p.team)));
        const defaultHome = teamCodes.includes("LAFC") ? "LAFC" : teamCodes[0] ?? "";
        setHomeTeamName(defaultHome);
        const homeRaw = data
          .filter(
            (p) =>
              p.team === defaultHome && p.position !== "GK" && p.position !== "SUB"
          )
          .slice(0, 10);
        const defaultAway = teamCodes.find((t) => t !== defaultHome) ?? defaultHome;
        const awayRaw = data.filter((p) => p.team === defaultAway).slice(0, 10);
        setHomePlayers(placeHomeFromRoster(homeRaw, "balanced"));
        setAwayPlayers(placeAwayFromRoster(awayRaw));
        if (homeRaw.length > 0) {
          setBallCarrierId(String(homeRaw[0].player_id));
        }
        setRosterEpoch((e) => e + 1);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  useEffect(() => {
    if (!ballCarrierId || homePlayers.length === 0) return;
    scheduleRecommendation();
  }, [
    ballCarrierId,
    homeTeamName,
    formationKey,
    rosterEpoch,
    homePlayers.length,
    awayPlayers.length,
    scheduleRecommendation,
  ]);

  const onBallId = useMemo(() => {
    const bc = homePlayers.find((p) => p.id === ballCarrierId) ?? homePlayers[0];
    return bc?.id ?? null;
  }, [homePlayers, ballCarrierId]);

  useEffect(() => {
    if (!showThreatHeatmap || !onBallId) {
      return;
    }
    const pid = parseInt(onBallId, 10);
    if (Number.isNaN(pid)) return;
    let cancelled = false;
    startTransition(() => {
      setHeatmapLoading(true);
      setHeatmapError(null);
    });
    fetchPlayerThreatHeatmap(pid)
      .then((h) => {
        if (!cancelled) {
          setThreatHeatmap(h);
          setHeatmapError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setThreatHeatmap(null);
          setHeatmapError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setHeatmapLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showThreatHeatmap, onBallId]);

  const ballCarrier = useMemo(
    () => homePlayers.find((p) => p.id === ballCarrierId) ?? homePlayers[0] ?? null,
    [homePlayers, ballCarrierId]
  );

  const handlePointerDown = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    dragStateRef.current.id = id;
    setDraggingId(id);
    if (svgRef.current?.setPointerCapture) {
      try {
        svgRef.current.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStateRef.current.id || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const xCenter = (px / rect.width) * PITCH_LENGTH + PITCH_X_MIN;
    const yCenter = PITCH_Y_MAX - (py / rect.height) * PITCH_WIDTH;
    const { x, y } = clampPitch(xCenter, yCenter);
    const id = dragStateRef.current.id;
    dragPendingRef.current = { id, x, y };
    scheduleRecommendation();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragStateRef.current.id) return;
    if (svgRef.current?.releasePointerCapture) {
      try {
        svgRef.current.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    dragStateRef.current.id = null;
    dragPendingRef.current = null;
    setDraggingId(null);
    scheduleRecommendation();
  };

  useEffect(() => {
    let rafId: number | null = null;
    const applyDrag = () => {
      const pending = dragPendingRef.current;
      if (pending?.id) {
        const { id, x, y } = pending;
        setHomePlayers((prev) => prev.map((p) => (p.id === id ? { ...p, x, y } : p)));
        setAwayPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, x, y } : p)));
      }
      rafId = window.requestAnimationFrame(applyDrag);
    };
    rafId = window.requestAnimationFrame(applyDrag);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const resetBoard = () => {
    setRecommendation(null);
    if (roster.length === 0) return;
    const homeRaw = roster
      .filter(
        (p) =>
          p.team === homeTeamName && p.position !== "GK" && p.position !== "SUB"
      )
      .slice(0, 10);
    const teamCodes = Array.from(new Set(roster.map((p) => p.team)));
    const defaultAway = teamCodes.find((t) => t !== homeTeamName) ?? homeTeamName;
    const awayRaw = roster.filter((p) => p.team === defaultAway).slice(0, 10);
    setHomePlayers(placeHomeFromRoster(homeRaw, formationKey));
    setAwayPlayers(placeAwayFromRoster(awayRaw));
    if (homeRaw.length > 0) {
      setBallCarrierId(String(homeRaw[0].player_id));
    }
    scheduleRecommendation();
  };

  const randomizeDefenders = () => {
    setAwayPlayers((prev) =>
      prev.map((p) => {
        const dx = (Math.random() - 0.5) * 6;
        const dy = (Math.random() - 0.5) * 6;
        const { x, y } = clampPitch(p.x + dx, p.y + dy);
        return { ...p, x, y };
      })
    );
    scheduleRecommendation();
  };

  const renderArrow = () => {
    if (!ballCarrier || !recommendation) return null;
    const { target } = recommendation;
    const fromX = ballCarrier.x;
    const fromY = ballCarrier.y;
    const toX = target.x;
    const toY = target.y;
    const { x: sx, y: sy } = worldToSvg(fromX, fromY);
    const { x: ex, y: ey } = worldToSvg(toX, toY);
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const ux = dx / len;
    const uy = dy / len;
    const headLen = 3;
    const hx1 = ex - ux * headLen - uy * headLen * 0.6;
    const hy1 = ey - uy * headLen + ux * headLen * 0.6;
    const hx2 = ex - ux * headLen + uy * headLen * 0.6;
    const hy2 = ey - uy * headLen - ux * headLen * 0.6;

    return (
      <g stroke="rgb(52, 211, 153)" strokeWidth={0.7} fill="rgb(52, 211, 153)">
        <line x1={sx} y1={sy} x2={ex} y2={ey} />
        <polygon points={`${ex},${ey} ${hx1},${hy1} ${hx2},${hy2}`} />
      </g>
    );
  };

  const teamNameByCode = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of roster) {
      if (!map[p.team]) {
        const tn = p.team_name?.trim();
        map[p.team] = tn && tn.length > 0 ? tn : p.team;
      }
    }
    return map;
  }, [roster]);

  const formatTeamLabel = (code: string): string => {
    const full = teamNameByCode[code] ?? code;
    if (full === code) return full;
    return `${full} (${code})`;
  };

  const teams = useMemo(() => Array.from(new Set(roster.map((p) => p.team))), [roster]);

  const homeTeamPlayers = useMemo(
    () =>
      roster.filter(
        (p) =>
          p.team === homeTeamName && p.position !== "GK" && p.position !== "SUB"
      ),
    [roster, homeTeamName]
  );

  const selectClass =
    "min-w-[200px] rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";

  const btnClass =
    "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Home team
          </span>
          <select
            value={homeTeamName}
            onChange={(e) => {
              const team = e.target.value;
              setHomeTeamName(team);
              const homeRaw = roster
                .filter(
                  (p) =>
                    p.team === team && p.position !== "GK" && p.position !== "SUB"
                )
                .slice(0, 10);
              const teamCodes = Array.from(new Set(roster.map((p) => p.team)));
              const defaultAway = teamCodes.find((t) => t !== team) ?? team;
              const awayRaw = roster.filter((p) => p.team === defaultAway).slice(0, 10);
              if (homeRaw.length > 0) {
                setHomePlayers(placeHomeFromRoster(homeRaw, formationKey));
                setAwayPlayers(placeAwayFromRoster(awayRaw));
                setBallCarrierId(String(homeRaw[0].player_id));
                scheduleRecommendation();
              }
            }}
            className={selectClass}
          >
            {teams.map((t) => (
              <option key={t} value={t}>
                {formatTeamLabel(t)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Formation
          </span>
          <select
            value={formationKey}
            onChange={(e) => {
              const key = e.target.value as FormationKey;
              setFormationKey(key);
              const homeRaw = roster
                .filter(
                  (p) =>
                    p.team === homeTeamName &&
                    p.position !== "GK" &&
                    p.position !== "SUB"
                )
                .slice(0, 10);
              if (homeRaw.length > 0) {
                setHomePlayers(placeHomeFromRoster(homeRaw, key));
                scheduleRecommendation();
              }
            }}
            className={selectClass}
          >
            {(Object.keys(FORMATIONS) as FormationKey[]).map((k) => (
              <option key={k} value={k}>
                {FORMATIONS[k].label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            On-ball player
          </span>
          <select
            value={onBallId ?? ""}
            onChange={(e) => {
              setBallCarrierId(e.target.value || null);
              scheduleRecommendation();
            }}
            className={selectClass}
          >
            {homeTeamPlayers.map((p) => (
              <option key={p.player_id} value={p.player_id}>
                {p.name} — {p.position}
              </option>
            ))}
          </select>
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/80">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-400 text-emerald-600 focus:ring-emerald-500"
            checked={showThreatHeatmap}
            onChange={(e) => {
              const on = e.target.checked;
              setShowThreatHeatmap(on);
              if (!on) {
                setThreatHeatmap(null);
                setHeatmapError(null);
                setHeatmapLoading(false);
              }
            }}
          />
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
            Threat heat map
          </span>
        </label>

        <button type="button" onClick={resetBoard} className={btnClass}>
          Reset board
        </button>
        <button type="button" onClick={randomizeDefenders} className={btnClass}>
          Randomize defenders
        </button>

        {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
        {heatmapError && (
          <span className="text-xs text-amber-700 dark:text-amber-400" title={heatmapError}>
            Heat map unavailable
          </span>
        )}
      </div>

      {showThreatHeatmap && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {heatmapLoading && "Loading threat surface…"}
          {!heatmapLoading && threatHeatmap && threatHeatmap.note}
        </p>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="relative w-full lg:flex-1">
          <svg
            ref={svgRef}
            viewBox="0 0 105 68"
            className="block h-auto w-full overflow-hidden rounded-xl border border-zinc-200 shadow-md ring-1 ring-black/5 dark:border-zinc-700 dark:ring-white/10"
            preserveAspectRatio="xMidYMid meet"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <defs>
              <linearGradient id="pitchTurf" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#064e3b" />
                <stop offset="100%" stopColor="#022c22" />
              </linearGradient>
            </defs>
            <rect x={0} y={0} width={105} height={68} fill="url(#pitchTurf)" />
            <g stroke="rgba(148,163,184,0.85)" strokeWidth={0.35} fill="none">
              <rect x={0} y={0} width={105} height={68} />
              <line x1={52.5} y1={0} x2={52.5} y2={68} />
              <circle cx={52.5} cy={34} r={9.15} />
              <rect x={0} y={26} width={3} height={16} />
              <rect x={102} y={26} width={3} height={16} />
            </g>
            {showThreatHeatmap && threatHeatmap && (
              <ThreatHeatCells heatmap={threatHeatmap} />
            )}
            {renderArrow()}
            {homePlayers.map((p) => {
              const { x: cx, y: cy } = worldToSvg(p.x, p.y);
              const isOnBall = p.id === onBallId;
              const isDragging = p.id === draggingId;
              const radius = isDragging ? 3.2 : 2.7;
              return (
                <g
                  key={p.id}
                  onPointerDown={handlePointerDown(p.id)}
                  style={{ cursor: isDragging ? "grabbing" : "grab" }}
                >
                  <circle cx={cx} cy={cy} r={radius + 1.4} fill="transparent" stroke="none" />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill={HOME_COLOR}
                    stroke={
                      isOnBall || isDragging ? "rgb(16, 185, 129)" : "rgba(0,0,0,0.45)"
                    }
                    strokeWidth={isOnBall || isDragging ? 1 : 0.4}
                  />
                  {isOnBall && (
                    <text
                      x={cx}
                      y={cy - (radius + 1.5)}
                      textAnchor="middle"
                      pointerEvents="none"
                      className="fill-emerald-300 text-[3px] font-bold"
                    >
                      ON BALL
                    </text>
                  )}
                  <title>{p.name}</title>
                </g>
              );
            })}
            {awayPlayers.map((p) => {
              const { x: cx, y: cy } = worldToSvg(p.x, p.y);
              const isDragging = p.id === draggingId;
              const radius = isDragging ? 3.2 : 2.7;
              return (
                <g
                  key={p.id}
                  onPointerDown={handlePointerDown(p.id)}
                  style={{ cursor: isDragging ? "grabbing" : "grab" }}
                >
                  <circle cx={cx} cy={cy} r={radius + 1.4} fill="transparent" stroke="none" />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill={AWAY_COLOR}
                    stroke={isDragging ? "rgb(251, 191, 36)" : "rgba(0,0,0,0.45)"}
                    strokeWidth={isDragging ? 1 : 0.4}
                  />
                  <title>{p.name}</title>
                </g>
              );
            })}
            {ballCarrier &&
              (() => {
                const b = worldToSvg(ballCarrier.x, ballCarrier.y);
                return (
                  <circle
                    cx={b.x}
                    cy={b.y}
                    r={1.6}
                    fill="#ffffff"
                    stroke="rgba(0,0,0,0.65)"
                    strokeWidth={0.35}
                  />
                );
              })()}
          </svg>
        </div>

        <div className="w-full rounded-xl border border-zinc-200 bg-zinc-50/90 p-5 text-sm text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-100 lg:w-80 lg:shrink-0">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Recommendation
          </h3>
          {loadingRec && <p className="text-xs text-zinc-500">Computing recommendation…</p>}
          {!loadingRec && recommendation && (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-medium uppercase text-zinc-500 dark:text-zinc-400">
                  Best action
                </div>
                <div className="text-base font-semibold capitalize text-emerald-600 dark:text-emerald-400">
                  {recommendation.best_action}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[10px] text-zinc-500">EPV</div>
                  <div className="font-medium tabular-nums">{recommendation.epv.toFixed(3)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500">Q_pass</div>
                  <div className="font-medium tabular-nums">{recommendation.q_pass.toFixed(3)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500">Q_dribble</div>
                  <div className="font-medium tabular-nums">{recommendation.q_dribble.toFixed(3)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500">Q_shoot</div>
                  <div className="font-medium tabular-nums">{recommendation.q_shoot.toFixed(3)}</div>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase text-zinc-500 dark:text-zinc-400">
                  Context
                </div>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                  Pass risk: {recommendation.explain.pass_risk.toFixed(3)} · nearest defender{" "}
                  {recommendation.explain.nearest_defender_dist.toFixed(1)}m
                </p>
              </div>
            </div>
          )}
          {!loadingRec && !recommendation && (
            <p className="text-xs text-zinc-500">
              Move players to refresh the heuristic EPV readout for the on-ball player.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
