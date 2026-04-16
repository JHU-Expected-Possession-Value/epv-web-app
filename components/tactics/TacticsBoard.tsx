"use client";

/**
 * Tactical Board UI (frontend-only rendering + interactions).
 *
 * Purpose (this phase):
 * - Drive all roster/player/heatmap data from the backend (AWS-backed RDS + EPV server)
 * - Send board state to the backend for real EPV model outputs (no local datasets in the browser)
 * - Keep the frontend responsible for drag/formation rendering only
 */

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
  fetchPlayerActionHeatmap,
  fetchTacticsPlayers,
  fetchTacticsTeams,
  fetchTacticsRecommendation,
  type PlayerActionHeatmapKind,
  type PlayerActionHeatmapResponse,
  type TacticsPlayerIn,
  type TacticsRecommendationRequest,
  type TacticsRecommendationResponse,
  type TacticsPlayer,
  type TacticsTeam,
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

/**
 * Formation presets (layout only).
 *
 * Where formation presets are defined:
 * - This map defines HOME (attacking-to-the-right) outfield slots (10).
 * - Away presets are derived by mirroring X (so they attack left).
 */
const FORMATIONS = {
  "442": {
    label: "4-4-2",
    slots: [
      // back 4
      { x: -38, y: -18 },
      { x: -38, y: -6 },
      { x: -38, y: 6 },
      { x: -38, y: 18 },
      // midfield 4
      { x: -16, y: -20 },
      { x: -16, y: -7 },
      { x: -16, y: 7 },
      { x: -16, y: 20 },
      // front 2
      { x: 12, y: -8 },
      { x: 12, y: 8 },
    ],
  },
  "433": {
    label: "4-3-3",
    slots: [
      { x: -38, y: -18 },
      { x: -38, y: -6 },
      { x: -38, y: 6 },
      { x: -38, y: 18 },
      { x: -16, y: -14 },
      { x: -16, y: 0 },
      { x: -16, y: 14 },
      { x: 10, y: -16 },
      { x: 12, y: 0 },
      { x: 10, y: 16 },
    ],
  },
  "352": {
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
  "4231": {
    label: "4-2-3-1",
    slots: [
      { x: -38, y: -18 },
      { x: -38, y: -6 },
      { x: -38, y: 6 },
      { x: -38, y: 18 },
      { x: -18, y: -8 },
      { x: -18, y: 8 },
      { x: 2, y: -16 },
      { x: 6, y: 0 },
      { x: 2, y: 16 },
      { x: 18, y: 0 },
    ],
  },
  "343": {
    label: "3-4-3",
    slots: [
      { x: -40, y: -12 },
      { x: -40, y: 0 },
      { x: -40, y: 12 },
      { x: -18, y: -18 },
      { x: -18, y: -6 },
      { x: -18, y: 6 },
      { x: -18, y: 18 },
      { x: 14, y: -14 },
      { x: 18, y: 0 },
      { x: 14, y: 14 },
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

function mirrorForAway(slot: { x: number; y: number }) {
  return { x: -slot.x, y: slot.y };
}

function placeFromSelection(
  side: "home" | "away",
  selected: TacticsPlayer[],
  formationKey: FormationKey
): TacticsPlayerState[] {
  const baseSlots = FORMATIONS[formationKey].slots;
  const slots = side === "away" ? baseSlots.map(mirrorForAway) : baseSlots;
  const n = Math.min(selected.length, slots.length);
  return selected.slice(0, n).map((p, i) => ({
    id: String(p.player_id),
    name: `${p.name}${p.position ? ` — ${p.position}` : ""}`,
    team: side,
    position: p.position ?? "",
    x: slots[i]?.x ?? (side === "home" ? -10 : 10),
    y: slots[i]?.y ?? 0,
  }));
}

function worldToSvg(wx: number, wy: number): { x: number; y: number } {
  const sx = ((wx - PITCH_X_MIN) / PITCH_LENGTH) * 105;
  const sy = ((PITCH_Y_MAX - wy) / PITCH_WIDTH) * 68;
  return { x: sx, y: sy };
}

function HeatCells({
  heatmap,
}: {
  heatmap: PlayerActionHeatmapResponse;
}) {
  const { cols, rows, cells } = heatmap;
  const dx = PITCH_LENGTH / cols;
  const dy = PITCH_WIDTH / rows;

  // Frontend rendering notes (visual only; data stays DB-backed):
  // - Backend returns `cells[].intensity` in [0,1] after binning season events from AWS RDS tables
  //   (`shots`/`goals`/`passes`/`carries`) into a cols×rows grid and applying an AWS-script-like
  //   normalization (vmax capped so hotspots saturate faster).
  // - Here we apply a small non-linear curve + a soccer-style color ramp + additive blending
  //   to get stronger hotspots and cleaner falloff without faking any data.

  const ramp = (t: number) => {
    // Piecewise ramp: teal/green → yellow → orange → red
    // (chosen to read well on dark pitch + preserve contrast)
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
    const mix = (c1: [number, number, number], c2: [number, number, number], u: number) => {
      const uu = clamp(u);
      return [
        Math.round(lerp(c1[0], c2[0], uu)),
        Math.round(lerp(c1[1], c2[1], uu)),
        Math.round(lerp(c1[2], c2[2], uu)),
      ] as [number, number, number];
    };
    const stops: Array<{ t: number; c: [number, number, number] }> = [
      { t: 0.0, c: [16, 185, 129] },   // emerald-ish
      { t: 0.45, c: [34, 197, 94] },   // green
      { t: 0.70, c: [250, 204, 21] },  // yellow
      { t: 0.85, c: [251, 146, 60] },  // orange
      { t: 1.0, c: [239, 68, 68] },    // red
    ];
    const tt = clamp(t);
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i]!;
      const b = stops[i + 1]!;
      if (tt >= a.t && tt <= b.t) {
        const u = (tt - a.t) / Math.max(1e-6, b.t - a.t);
        return mix(a.c, b.c, u);
      }
    }
    return stops[stops.length - 1]!.c;
  };

  const curve = (t: number) => {
    // Stronger hotspots + less muddy midtones:
    // lift lows slightly, then apply gamma < 1 to boost highs.
    const clamped = Math.max(0, Math.min(1, t));
    const lifted = clamped < 0.02 ? 0 : (clamped - 0.02) / 0.98;
    return Math.pow(lifted, 0.65);
  };

  return (
    // Heatmap rendering (UI only):
    // - Backend bins season events from AWS RDS tables (`shots` / `passes` / `carries`) into cells.
    // - Frontend renders those cells with a blur to look like a real soccer heatmap.
    <g
      className="pointer-events-none"
      aria-hidden
      filter="url(#heatBlur)"
      style={{ mixBlendMode: "screen" }}
    >
      {cells.map((c) => {
        const wx = PITCH_X_MIN + (c.col + 0.5) * dx;
        const wy = PITCH_Y_MIN + (c.row + 0.5) * dy;
        const { x, y } = worldToSvg(wx, wy);
        const intensity = curve(Math.max(0, Math.min(1, c.intensity)));
        // Use layered circles (core + halo) for cleaner falloff than a single blob.
        const haloR = 4.6 + intensity * 10.8;
        const coreR = 1.6 + intensity * 4.4;
        const [rr, gg, bb] = ramp(intensity);
        const haloA = 0.10 + intensity * 0.30;
        const coreA = 0.18 + intensity * 0.55;
        return (
          <g key={`${c.col}-${c.row}`}>
            <circle
              cx={x}
              cy={y}
              r={haloR}
              fill={`rgba(${rr}, ${gg}, ${bb}, ${haloA})`}
              stroke="none"
            />
            <circle
              cx={x}
              cy={y}
              r={coreR}
              fill={`rgba(${rr}, ${gg}, ${bb}, ${coreA})`}
              stroke="none"
            />
          </g>
        );
      })}
    </g>
  );
}

export default function TacticsBoard() {
  const [teams, setTeams] = useState<TacticsTeam[]>([]);
  const [homeTeamId, setHomeTeamId] = useState<number | null>(null);
  const [awayTeamId, setAwayTeamId] = useState<number | null>(null);
  const [homeTeamPlayers, setHomeTeamPlayers] = useState<TacticsPlayer[]>([]);
  const [awayTeamPlayers, setAwayTeamPlayers] = useState<TacticsPlayer[]>([]);
  const [homeSelected, setHomeSelected] = useState<TacticsPlayer[]>([]);
  const [awaySelected, setAwaySelected] = useState<TacticsPlayer[]>([]);
  const [homePlayers, setHomePlayers] = useState<TacticsPlayerState[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<TacticsPlayerState[]>([]);
  const [ballCarrierId, setBallCarrierId] = useState<string | null>(null);
  const [homeFormationKey, setHomeFormationKey] = useState<FormationKey>("433");
  const [awayFormationKey, setAwayFormationKey] = useState<FormationKey>("442");
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapKind, setHeatmapKind] = useState<PlayerActionHeatmapKind>("shots");
  const [heatmap, setHeatmap] = useState<PlayerActionHeatmapResponse | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<TacticsRecommendationResponse | null>(null);
  const [loadingRec, setLoadingRec] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  // Drag behavior is handled here (pointer capture + rAF state updates).
  const dragStateRef = useRef<{ id: string | null; dx: number; dy: number }>({
    id: null,
    dx: 0,
    dy: 0,
  });
  const dragPendingRef = useRef<{ id: string | null; x: number; y: number } | null>(null);
  const recDebounceRef = useRef<number | null>(null);
  const requestSeqRef = useRef(0);
  const homePlayersRef = useRef(homePlayers);
  const awayPlayersRef = useRef(awayPlayers);
  const ballCarrierIdRef = useRef(ballCarrierId);
  const lastRecSentAtRef = useRef<number>(0);

  useEffect(() => {
    homePlayersRef.current = homePlayers;
  }, [homePlayers]);
  useEffect(() => {
    awayPlayersRef.current = awayPlayers;
  }, [awayPlayers]);
  useEffect(() => {
    ballCarrierIdRef.current = ballCarrierId;
  }, [ballCarrierId]);
  const homeSelectedRef = useRef(homeSelected);
  const awaySelectedRef = useRef(awaySelected);
  useEffect(() => {
    homeSelectedRef.current = homeSelected;
  }, [homeSelected]);
  useEffect(() => {
    awaySelectedRef.current = awaySelected;
  }, [awaySelected]);

  const runRecommendation = useCallback(() => {
    const hp = homePlayersRef.current;
    const ap = awayPlayersRef.current;
    const bcid = ballCarrierIdRef.current;
    // Selected player → model input connection:
    // - The on-ball player drives `possessionTeam` and `ballOwnerId` in the backend EPV request.
    // - Individuality is applied on the backend by looking up `player_id` in the skill CSV registry.
    const ballCarrier =
      hp.find((p) => p.id === bcid) ?? ap.find((p) => p.id === bcid) ?? hp[0] ?? ap[0] ?? null;
    if (!ballCarrier) return;
    const ballCarrierTeam: "home" | "away" = ballCarrier.team;
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    // Coordinate transformation (frontend → backend):
    // - The board state lives in centered pitch meters: x∈[-52.5,52.5], y∈[-34,34]
    // - We send those centered meters directly.
    // - Backend converts centered meters → API pitch coords (0..105, 0..68) to satisfy its EPVRequest schema,
    //   then converts back to centered meters for the EPVCalculator internals.
    const payload: TacticsRecommendationRequest = {
      ball_carrier: {
        player_id: ballCarrier.id,
        x: ballCarrier.x,
        y: ballCarrier.y,
        team: ballCarrierTeam,
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

  // Where backend requests happen: tactical recommendation (EPV models).
  const scheduleRecommendation = useCallback((force = false) => {
    if (recDebounceRef.current !== null) {
      window.clearTimeout(recDebounceRef.current);
    }
    const delay = force ? 0 : 180;
    recDebounceRef.current = window.setTimeout(() => {
      recDebounceRef.current = null;
      runRecommendation();
    }, delay);
  }, [runRecommendation]);

  useEffect(() => {
    fetchTacticsTeams()
      .then((ts) => {
        setTeams(ts);
        const first = ts[0]?.team_id ?? null;
        const second = ts[1]?.team_id ?? first;
        setHomeTeamId(first);
        setAwayTeamId(second);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  useEffect(() => {
    if (homeTeamId == null) return;
    fetchTacticsPlayers(homeTeamId)
      .then((ps) => {
        setHomeTeamPlayers(ps);
        const selected = ps.slice(0, 10);
        setHomeSelected(selected);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [homeTeamId]);

  useEffect(() => {
    if (awayTeamId == null) return;
    fetchTacticsPlayers(awayTeamId)
      .then((ps) => {
        setAwayTeamPlayers(ps);
        const selected = ps.slice(0, 10);
        setAwaySelected(selected);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [awayTeamId]);

  useEffect(() => {
    if (homeSelected.length > 0) {
      setHomePlayers(placeFromSelection("home", homeSelected, homeFormationKey));
      setBallCarrierId(String(homeSelected[0].player_id));
    }
  }, [homeSelected, homeFormationKey]);

  useEffect(() => {
    if (awaySelected.length > 0) {
      setAwayPlayers(placeFromSelection("away", awaySelected, awayFormationKey));
    }
  }, [awaySelected, awayFormationKey]);

  useEffect(() => {
    if (!ballCarrierId || homePlayers.length === 0) return;
    scheduleRecommendation();
  }, [ballCarrierId, homePlayers.length, awayPlayers.length, scheduleRecommendation]);

  const onBallId = useMemo(() => {
    const bc =
      homePlayers.find((p) => p.id === ballCarrierId) ??
      awayPlayers.find((p) => p.id === ballCarrierId) ??
      homePlayers[0] ??
      awayPlayers[0];
    return bc?.id ?? null;
  }, [homePlayers, ballCarrierId]);

  useEffect(() => {
    // Where backend requests happen: action heatmaps (AWS tables).
    if (!showHeatmap || !onBallId) return;
    const pid = parseInt(onBallId, 10);
    if (Number.isNaN(pid)) return;
    let cancelled = false;
    startTransition(() => {
      setHeatmapLoading(true);
      setHeatmapError(null);
    });
    // Heatmap orientation: ask backend to orient distribution into the same attacking
    // direction used by the board (home → right, away → left).
    const side: "home" | "away" =
      homePlayersRef.current.some((p) => p.id === String(pid)) ? "home" : "away";
    fetchPlayerActionHeatmap(pid, heatmapKind, side)
      .then((h) => {
        if (!cancelled) {
          setHeatmap(h);
          setHeatmapError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setHeatmap(null);
          setHeatmapError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setHeatmapLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showHeatmap, onBallId, heatmapKind]);

  const ballCarrier = useMemo(() => {
    return (
      homePlayers.find((p) => p.id === ballCarrierId) ??
      awayPlayers.find((p) => p.id === ballCarrierId) ??
      homePlayers[0] ??
      awayPlayers[0] ??
      null
    );
  }, [homePlayers, awayPlayers, ballCarrierId]);

  const handlePointerDown = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    const p =
      homePlayersRef.current.find((pp) => pp.id === id) ??
      awayPlayersRef.current.find((pp) => pp.id === id) ??
      null;
    // Make drag controllable: preserve pointer offset so the player doesn't "jump" to cursor.
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect && p) {
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const xCenter = (px / rect.width) * PITCH_LENGTH + PITCH_X_MIN;
      const yCenter = PITCH_Y_MAX - (py / rect.height) * PITCH_WIDTH;
      dragStateRef.current = { id, dx: p.x - xCenter, dy: p.y - yCenter };
    } else {
      dragStateRef.current = { id, dx: 0, dy: 0 };
    }
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
    const { x, y } = clampPitch(
      xCenter + dragStateRef.current.dx,
      yCenter + dragStateRef.current.dy
    );
    const id = dragStateRef.current.id;
    dragPendingRef.current = { id, x, y };
    // Throttle backend calls while dragging; rAF updates keep UI smooth.
    const now = performance.now();
    if (now - lastRecSentAtRef.current > 300) {
      lastRecSentAtRef.current = now;
      scheduleRecommendation();
    }
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
    dragStateRef.current = { id: null, dx: 0, dy: 0 };
    dragPendingRef.current = null;
    setDraggingId(null);
    scheduleRecommendation(true);
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
    setHomePlayers(placeFromSelection("home", homeSelectedRef.current, homeFormationKey));
    setAwayPlayers(placeFromSelection("away", awaySelectedRef.current, awayFormationKey));
    if (homeSelectedRef.current.length > 0) {
      setBallCarrierId(String(homeSelectedRef.current[0].player_id));
    }
    scheduleRecommendation(true);
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

  const formatTeamLabel = (t: TacticsTeam): string => t.team_name?.trim() || `Team ${t.team_id}`;

  const selectClass =
    "min-w-[200px] rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";

  const btnClass =
    "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700";

  // Where player selection is handled: team/player dropdowns.
  const updateSelected = useCallback(
    (side: "home" | "away", slotIdx: number, nextPlayerId: number) => {
      const pool = side === "home" ? homeTeamPlayers : awayTeamPlayers;
      const picked = pool.find((p) => p.player_id === nextPlayerId);
      if (!picked) return;
      const setter = side === "home" ? setHomeSelected : setAwaySelected;
      setter((prev) => {
        const next = prev.slice(0, 10);
        while (next.length < 10) next.push(picked);
        // De-dupe: if player already selected elsewhere, swap.
        const existingIdx = next.findIndex((p, i) => i !== slotIdx && p.player_id === nextPlayerId);
        if (existingIdx >= 0) {
          const tmp = next[slotIdx];
          next[slotIdx] = next[existingIdx];
          next[existingIdx] = tmp;
        } else {
          next[slotIdx] = picked;
        }
        return next;
      });
      scheduleRecommendation(true);
    },
    [awayTeamPlayers, homeTeamPlayers, scheduleRecommendation]
  );

  return (
    <div className="space-y-5">
      {/* Simplified EPV workflow controls:
          choose teams → choose formations → choose on-ball player → drag → read EPV options */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Home team
          </span>
          <select value={homeTeamId ?? ""} onChange={(e) => setHomeTeamId(Number(e.target.value))} className={selectClass}>
            {teams.map((t) => (
              <option key={t.team_id} value={t.team_id}>
                {formatTeamLabel(t)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Away team
          </span>
          <select value={awayTeamId ?? ""} onChange={(e) => setAwayTeamId(Number(e.target.value))} className={selectClass}>
            {teams.map((t) => (
              <option key={t.team_id} value={t.team_id}>
                {formatTeamLabel(t)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Home formation
          </span>
          <select
            value={homeFormationKey}
            onChange={(e) => {
              const key = e.target.value as FormationKey;
              setHomeFormationKey(key);
              setHomePlayers(placeFromSelection("home", homeSelectedRef.current, key));
              scheduleRecommendation(true);
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
            Away formation
          </span>
          <select
            value={awayFormationKey}
            onChange={(e) => {
              const key = e.target.value as FormationKey;
              setAwayFormationKey(key);
              setAwayPlayers(placeFromSelection("away", awaySelectedRef.current, key));
              scheduleRecommendation(true);
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
            <optgroup label="Home">
              {homeSelected.map((p) => (
                <option key={`h-${p.player_id}`} value={p.player_id}>
                  {p.name} {p.position ? `— ${p.position}` : ""}
                </option>
              ))}
            </optgroup>
            <optgroup label="Away">
              {awaySelected.map((p) => (
                <option key={`a-${p.player_id}`} value={p.player_id}>
                  {p.name} {p.position ? `— ${p.position}` : ""}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/80">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-zinc-400 text-emerald-600 focus:ring-emerald-500"
            checked={showHeatmap}
            onChange={(e) => {
              const on = e.target.checked;
              setShowHeatmap(on);
              if (!on) {
                setHeatmap(null);
                setHeatmapError(null);
                setHeatmapLoading(false);
              }
            }}
          />
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
            Player heatmap
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Heatmap kind
          </span>
          <select value={heatmapKind} onChange={(e) => setHeatmapKind(e.target.value as PlayerActionHeatmapKind)} className={selectClass}>
            <option value="shots">Shots</option>
            <option value="goals">Goals</option>
            <option value="passes">Passes</option>
            <option value="carries">Dribbles/Carries</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className={btnClass}
        >
          {showAdvanced ? "Hide lineup editor" : "Edit lineups"}
        </button>
        <button type="button" onClick={resetBoard} className={btnClass}>
          Reset
        </button>
        <button type="button" onClick={randomizeDefenders} className={btnClass}>
          Randomize away
        </button>

        {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
        {heatmapError && (
          <span className="text-xs text-amber-700 dark:text-amber-400" title={heatmapError}>
            Heat map unavailable
          </span>
        )}
      </div>

      {/* Advanced controls (lineup editor) kept but hidden by default to reduce clutter. */}
      {showAdvanced && (
        <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white/60 p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/40">
          <div className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
            Home XI (select players)
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Array.from({ length: 10 }, (_, i) => (
              <select
                key={`home-slot-${i}`}
                className={selectClass}
                value={homeSelected[i]?.player_id ?? ""}
                onChange={(e) => updateSelected("home", i, Number(e.target.value))}
              >
                {homeTeamPlayers.map((p) => (
                  <option key={p.player_id} value={p.player_id}>
                    {p.name} {p.position ? `— ${p.position}` : ""}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white/60 p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/40">
          <div className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
            Away XI (select players)
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Array.from({ length: 10 }, (_, i) => (
              <select
                key={`away-slot-${i}`}
                className={selectClass}
                value={awaySelected[i]?.player_id ?? ""}
                onChange={(e) => updateSelected("away", i, Number(e.target.value))}
              >
                {awayTeamPlayers.map((p) => (
                  <option key={p.player_id} value={p.player_id}>
                    {p.name} {p.position ? `— ${p.position}` : ""}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </div>
      </div>
      )}

      {showHeatmap && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {heatmapLoading && "Loading threat surface…"}
          {!heatmapLoading && heatmap && heatmap.note}
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
              {/* Non-obvious UI detail: blur makes binned cells look like a true heatmap. */}
              <filter id="heatBlur" x="-20%" y="-20%" width="140%" height="140%">
                {/* Slightly tighter blur + contrast transfer reduces muddy blending. */}
                <feGaussianBlur stdDeviation="0.85" />
                <feComponentTransfer>
                  <feFuncR type="gamma" amplitude="1.0" exponent="0.90" offset="0.0" />
                  <feFuncG type="gamma" amplitude="1.0" exponent="0.90" offset="0.0" />
                  <feFuncB type="gamma" amplitude="1.0" exponent="0.90" offset="0.0" />
                  <feFuncA type="gamma" amplitude="1.0" exponent="0.95" offset="0.0" />
                </feComponentTransfer>
              </filter>
            </defs>
            <rect x={0} y={0} width={105} height={68} fill="url(#pitchTurf)" />
            <g stroke="rgba(148,163,184,0.85)" strokeWidth={0.35} fill="none">
              <rect x={0} y={0} width={105} height={68} />
              <line x1={52.5} y1={0} x2={52.5} y2={68} />
              <circle cx={52.5} cy={34} r={9.15} />
              <rect x={0} y={26} width={3} height={16} />
              <rect x={102} y={26} width={3} height={16} />
            </g>
            {/* Where heatmap data is rendered */}
            {showHeatmap && heatmap && (
              <HeatCells heatmap={heatmap} />
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
                    // On-ball drag handling: the "ball" visual sits above the on-ball player in
                    // the SVG draw order. If it captures pointer events, dragging the on-ball
                    // player becomes noticeably less smooth than other players.
                    pointerEvents="none"
                  />
                );
              })()}
          </svg>
        </div>

        <div className="w-full rounded-xl border border-zinc-200 bg-zinc-50/90 p-5 text-sm text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-100 lg:w-80 lg:shrink-0">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            EPV decision
          </h3>
          {loadingRec && <p className="text-xs text-zinc-500">Computing recommendation…</p>}
          {!loadingRec && recommendation && (
            <div className="space-y-4">
              <div className="text-[11px] text-zinc-600 dark:text-zinc-300">
                {ballCarrier ? (
                  <>
                    On-ball: <span className="font-semibold">{ballCarrier.name}</span>{" "}
                    <span className="text-zinc-400">({ballCarrier.team})</span>
                  </>
                ) : null}
              </div>

              {/* Model output → UI connection:
                  q_pass/q_dribble/q_shoot come from the real backend EPV models (no placeholders). */}
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { k: "pass", label: "Pass", v: recommendation.q_pass },
                    { k: "dribble", label: "Dribble", v: recommendation.q_dribble },
                    { k: "shoot", label: "Shoot", v: recommendation.q_shoot },
                  ] as const
                ).map((a) => {
                  const isBest = recommendation.best_action === a.k;
                  return (
                    <div
                      key={a.k}
                      className={`rounded-lg border p-3 ${
                        isBest
                          ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500/60 dark:bg-emerald-900/20"
                          : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                          {a.label}
                        </span>
                        {isBest && (
                          <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            RECOMMENDED
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-lg font-semibold tabular-nums">
                        {a.v.toFixed(3)}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        EPV(action)
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                    Overall EPV
                  </span>
                  <span className="font-semibold tabular-nums">
                    {recommendation.epv.toFixed(3)}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Pass risk {recommendation.explain.pass_risk.toFixed(3)} · nearest defender{" "}
                  {recommendation.explain.nearest_defender_dist.toFixed(1)}m
                </div>
              </div>
            </div>
          )}
          {!loadingRec && !recommendation && (
            <p className="text-xs text-zinc-500">
              Drag players to refresh the EPV action values for the on-ball player.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
