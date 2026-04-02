"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PitchRenderer, { PITCH_HOME_COLOR, PITCH_AWAY_COLOR } from "@/components/replay/PitchRenderer";
import {
  fetchTacticsRecommendation,
  fetchTacticsRoster,
  type TacticsPlayerIn,
  type TacticsRecommendationRequest,
  type TacticsRecommendationResponse,
  type TacticsRosterPlayer,
} from "@/lib/api";

type RosterPlayer = TacticsRosterPlayer & { player_id: number | string };

type TacticsPlayerState = {
  id: string;
  name: string;
  team: "home" | "away";
  position: string;
  x: number; // center coords
  y: number;
};

const HOME_COLOR = PITCH_HOME_COLOR;
const AWAY_COLOR = PITCH_AWAY_COLOR;

const PITCH_X_MIN = -52.5;
const PITCH_X_MAX = 52.5;
const PITCH_Y_MIN = -34;
const PITCH_Y_MAX = 34;

function clampPitch(x: number, y: number) {
  return {
    x: Math.max(PITCH_X_MIN, Math.min(PITCH_X_MAX, x)),
    y: Math.max(PITCH_Y_MIN, Math.min(PITCH_Y_MAX, y)),
  };
}

export default function TacticsBoard() {
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [homePlayers, setHomePlayers] = useState<TacticsPlayerState[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<TacticsPlayerState[]>([]);
  const [ballCarrierId, setBallCarrierId] = useState<string | null>(null);
  const [homeTeamName, setHomeTeamName] = useState<string>("");
  const [recommendation, setRecommendation] = useState<TacticsRecommendationResponse | null>(null);
  const [loadingRec, setLoadingRec] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<{ id: string | null }>({ id: null });
  const dragPendingRef = useRef<{ id: string | null; x: number; y: number } | null>(null);
  const recDebounceRef = useRef<number | null>(null);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    fetchTacticsRoster()
      .then((data) => {
        const normalized: RosterPlayer[] = data.map((p) => ({
          ...p,
          player_id: p.player_id,
        }));
        setRoster(normalized);
        const teamCodes = Array.from(new Set(normalized.map((p) => p.team)));
        const defaultHome = teamCodes.includes("LAFC") ? "LAFC" : teamCodes[0] ?? "";
        setHomeTeamName(defaultHome);
        // quick default layout: 10 home from selected team, 10 away from a different team if possible
        const homeRaw = normalized.filter((p) => p.team === defaultHome).slice(0, 10);
        const defaultAway = teamCodes.find((t) => t !== defaultHome) ?? defaultHome;
        const awayRaw = normalized.filter((p) => p.team === defaultAway).slice(0, 10);
        const spread = (count: number, xStart: number, xEnd: number, yRow: number[]) => {
          const xs = Array.from({ length: count }, (_, i) =>
            xStart + ((xEnd - xStart) * (i + 1)) / (count + 1)
          );
          return xs.map((x, i) => ({ x, y: yRow[i % yRow.length] }));
        };
        const homeLayout = spread(homeRaw.length, -30, 20, [-20, -7, 7, 20]);
        const awayLayout = spread(awayRaw.length, -20, 30, [-20, -7, 7, 20]);
        setHomePlayers(
          homeRaw.map((p, i) => ({
            id: String(p.player_id),
            name: `${p.name} (${p.team}) — ${p.position}`,
            team: "home",
            position: p.position,
            x: homeLayout[i]?.x ?? -10,
            y: homeLayout[i]?.y ?? 0,
          }))
        );
        setAwayPlayers(
          awayRaw.map((p, i) => ({
            id: String(p.player_id),
            name: `${p.name} (${p.team}) — ${p.position}`,
            team: "away",
            position: p.position,
            x: awayLayout[i]?.x ?? 10,
            y: awayLayout[i]?.y ?? 0,
          }))
        );
        if (homeRaw.length > 0) {
          setBallCarrierId(String(homeRaw[0].player_id));
        }
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  const ballCarrier = useMemo(
    () => homePlayers.find((p) => p.id === ballCarrierId) ?? homePlayers[0] ?? null,
    [homePlayers, ballCarrierId]
  );

  const handlePointerDown = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    dragStateRef.current.id = id;
    setDraggingId(id);
    if (svgRef.current && svgRef.current.setPointerCapture) {
      try {
        svgRef.current.setPointerCapture(e.pointerId);
      } catch {
        // ignore if capture fails
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStateRef.current.id || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const xCenter = (px / rect.width) * (PITCH_X_MAX - PITCH_X_MIN) + PITCH_X_MIN;
    const yCenter = PITCH_Y_MAX - (py / rect.height) * (PITCH_Y_MAX - PITCH_Y_MIN);
    const { x, y } = clampPitch(xCenter, yCenter);
    const id = dragStateRef.current.id;
    dragPendingRef.current = { id, x, y };
    // schedule a recommendation while dragging (debounced)
    scheduleRecommendation();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragStateRef.current.id) return;
    if (svgRef.current && svgRef.current.releasePointerCapture) {
      try {
        svgRef.current.releasePointerCapture(e.pointerId);
      } catch {
        // ignore if release fails
      }
    }
    dragStateRef.current.id = null;
    dragPendingRef.current = null;
    setDraggingId(null);
    scheduleRecommendation();
  };

  // Apply drag updates at most once per animation frame for smoother feel
  useEffect(() => {
    let rafId: number | null = null;
    const applyDrag = () => {
      const pending = dragPendingRef.current;
      if (pending && pending.id) {
        const { id, x, y } = pending;
        setHomePlayers((prev) =>
          prev.map((p) => (p.id === id ? { ...p, x, y } : p))
        );
        setAwayPlayers((prev) =>
          prev.map((p) => (p.id === id ? { ...p, x, y } : p))
        );
      }
      rafId = window.requestAnimationFrame(applyDrag);
    };
    rafId = window.requestAnimationFrame(applyDrag);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const scheduleRecommendation = () => {
    if (recDebounceRef.current !== null) {
      window.clearTimeout(recDebounceRef.current);
    }
    recDebounceRef.current = window.setTimeout(() => {
      recDebounceRef.current = null;
      runRecommendation();
    }, 150);
  };

  const runRecommendation = () => {
    if (!ballCarrier) return;
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    const skills = getSkillsForPlayer(ballCarrier.id);
    const payload: TacticsRecommendationRequest = {
      ball_carrier: {
        player_id: ballCarrier.id,
        x: ballCarrier.x,
        y: ballCarrier.y,
        team: "home",
        pass_skill: skills.pass,
        dribble_skill: skills.dribble,
        shot_skill: skills.shot,
      },
      home: homePlayers.map<TacticsPlayerIn>((p) => ({
        player_id: p.id,
        x: p.x,
        y: p.y,
        pos: p.position,
      })),
      away: awayPlayers.map<TacticsPlayerIn>((p) => ({
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
  };

  const resetBoard = () => {
    setRecommendation(null);
    if (roster.length === 0) return;
    // re-run initial layout
    const homeRaw = roster.filter((p) => p.team === homeTeamName).slice(0, 10);
    const teamCodes = Array.from(new Set(roster.map((p) => p.team)));
    const defaultAway = teamCodes.find((t) => t !== homeTeamName) ?? homeTeamName;
    const awayRaw = roster.filter((p) => p.team === defaultAway).slice(0, 10);
    const spread = (count: number, xStart: number, xEnd: number, yRow: number[]) => {
      const xs = Array.from({ length: count }, (_, i) =>
        xStart + ((xEnd - xStart) * (i + 1)) / (count + 1)
      );
      return xs.map((x, i) => ({ x, y: yRow[i % yRow.length] }));
    };
    const homeLayout = spread(homeRaw.length, -30, 20, [-20, -7, 7, 20]);
    const awayLayout = spread(awayRaw.length, -20, 30, [-20, -7, 7, 20]);
    setHomePlayers(
      homeRaw.map((p, i) => ({
        id: String(p.player_id),
        name: `${p.name} (${p.team}) — ${p.position}`,
        team: "home",
        position: p.position,
        x: homeLayout[i]?.x ?? -10,
        y: homeLayout[i]?.y ?? 0,
      }))
    );
    setAwayPlayers(
      awayRaw.map((p, i) => ({
        id: String(p.player_id),
        name: `${p.name} (${p.team}) — ${p.position}`,
        team: "away",
        position: p.position,
        x: awayLayout[i]?.x ?? 10,
        y: awayLayout[i]?.y ?? 0,
      }))
    );
    if (homeRaw.length > 0) {
      setBallCarrierId(String(homeRaw[0].player_id));
    }
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
    const sx = ((fromX - PITCH_X_MIN) / (PITCH_X_MAX - PITCH_X_MIN)) * 105;
    const sy = (PITCH_Y_MAX - fromY) / (PITCH_Y_MAX - PITCH_Y_MIN) * 68;
    const ex = ((toX - PITCH_X_MIN) / (PITCH_X_MAX - PITCH_X_MIN)) * 105;
    const ey = (PITCH_Y_MAX - toY) / (PITCH_Y_MAX - PITCH_Y_MIN) * 68;
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

  const onBallId = ballCarrier?.id ?? null;

  // Human-readable team labels derived from roster metadata
  const teamNameByCode = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of roster) {
      if (!map[p.team]) {
        // @ts-expect-error team_name is provided by backend
        const tn = (p as any).team_name as string | undefined;
        map[p.team] = tn && tn.trim().length > 0 ? tn : p.team;
      }
    }
    return map;
  }, [roster]);

  const formatTeamLabel = (code: string): string => {
    const full = teamNameByCode[code] ?? code;
    if (full === code) return full;
    return `${full} (${code})`;
  };

  const teams = useMemo(
    () => Array.from(new Set(roster.map((p) => p.team))),
    [roster]
  );

  const homeTeamPlayers = useMemo(
    () =>
      roster.filter(
        (p) =>
          p.team === homeTeamName &&
          p.position !== "GK" &&
          p.position !== "SUB"
      ),
    [roster, homeTeamName]
  );

  const getSkillsForPlayer = (pid: string) => {
    const p = roster.find((r) => String(r.player_id) === pid);
    return {
      pass: p?.pass_skill ?? 1.0,
      dribble: p?.dribble_skill ?? 1.0,
      shot: p?.shot_skill ?? 1.0,
    };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase text-zinc-400">Home team</span>
          <select
            value={homeTeamName}
            onChange={(e) => {
              const team = e.target.value;
              setHomeTeamName(team);
              // rebuild home layout for new team
              const homeRaw = roster
                .filter(
                  (p) =>
                    p.team === team &&
                    p.position !== "GK" &&
                    p.position !== "SUB"
                )
                .slice(0, 10);
              if (homeRaw.length > 0) {
                const spread = (count: number, xStart: number, xEnd: number, yRow: number[]) => {
                  const xs = Array.from({ length: count }, (_, i) =>
                    xStart + ((xEnd - xStart) * (i + 1)) / (count + 1)
                  );
                  return xs.map((x, i) => ({ x, y: yRow[i % yRow.length] }));
                };
                const homeLayout = spread(homeRaw.length, -30, 20, [-20, -7, 7, 20]);
                setHomePlayers(
                  homeRaw.map((p, i) => ({
                    id: String(p.player_id),
                    name: `${p.name} (${p.team}) — ${p.position}`,
                    team: "home",
                    position: p.position,
                    x: homeLayout[i]?.x ?? -10,
                    y: homeLayout[i]?.y ?? 0,
                  }))
                );
                setBallCarrierId(String(homeRaw[0].player_id));
              }
            }}
            className="min-w-[220px] rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-50"
          >
            {teams.map((t) => (
              <option key={t} value={t}>
                {formatTeamLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase text-zinc-400">On-ball player</span>
          <select
            value={onBallId ?? ""}
            onChange={(e) => {
              setBallCarrierId(e.target.value || null);
              scheduleRecommendation();
            }}
            className="min-w-[220px] rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-50"
          >
            {homeTeamPlayers.map((p) => (
              <option key={p.player_id} value={p.player_id}>
                {p.name} — {p.position}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={resetBoard}
          className="rounded-md border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-800"
        >
          Reset board
        </button>
        <button
          type="button"
          onClick={randomizeDefenders}
          className="rounded-md border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-800"
        >
          Randomize defenders
        </button>
        {error && (
          <span className="text-xs text-red-400">
            {error}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="relative w-full lg:flex-1">
          <svg
            ref={svgRef}
            viewBox="0 0 105 68"
            className="block h-auto w-full rounded-lg border border-zinc-700 bg-zinc-900"
            preserveAspectRatio="xMidYMid meet"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {/* Underlay pitch via PitchRenderer, but we just re-draw lines here by delegating to it through a frame shape if needed.
                For now, we only render players + arrow on top of a blank pitch background color. */}
            <rect x={0} y={0} width={105} height={68} fill="#022c22" />
            {/* Simple pitch lines: half, center circle, goals */}
            <g stroke="rgba(148,163,184,0.8)" strokeWidth={0.4} fill="none">
              <rect x={0} y={0} width={105} height={68} />
              <line x1={52.5} y1={0} x2={52.5} y2={68} />
              <circle cx={52.5} cy={34} r={9.15} />
              {/* Goals at each end */}
              <rect x={0} y={26} width={3} height={16} />
              <rect x={102} y={26} width={3} height={16} />
            </g>
            {renderArrow()}
            {homePlayers.map((p) => {
              const cx = ((p.x - PITCH_X_MIN) / (PITCH_X_MAX - PITCH_X_MIN)) * 105;
              const cy = (PITCH_Y_MAX - p.y) / (PITCH_Y_MAX - PITCH_Y_MIN) * 68;
              const isOnBall = p.id === onBallId;
              const isDragging = p.id === draggingId;
              const radius = isDragging ? 3.2 : 2.7;
              const isDraggable = true;
              return (
                <g
                  key={p.id}
                  onPointerDown={isDraggable ? handlePointerDown(p.id) : undefined}
                  style={isDraggable ? { cursor: isDragging ? "grabbing" : "grab" } : undefined}
                >
                  {isDraggable && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius + 1.2}
                      fill="transparent"
                      stroke="none"
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill={HOME_COLOR}
                    stroke={
                      isOnBall || isDragging
                        ? "rgb(16, 185, 129)"
                        : "rgba(0,0,0,0.5)"
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
              const cx = ((p.x - PITCH_X_MIN) / (PITCH_X_MAX - PITCH_X_MIN)) * 105;
              const cy = (PITCH_Y_MAX - p.y) / (PITCH_Y_MAX - PITCH_Y_MIN) * 68;
              const isDragging = p.id === draggingId;
              const radius = isDragging ? 3.2 : 2.7;
              return (
                <g
                  key={p.id}
                  onPointerDown={handlePointerDown(p.id)}
                  style={{ cursor: isDragging ? "grabbing" : "grab" }}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill={AWAY_COLOR}
                    stroke={isDragging ? "rgb(251, 191, 36)" : "rgba(0,0,0,0.5)"}
                    strokeWidth={isDragging ? 1 : 0.4}
                  />
                  <title>{p.name}</title>
                </g>
              );
            })}
            {ballCarrier && (
              <circle
                cx={((ballCarrier.x - PITCH_X_MIN) / (PITCH_X_MAX - PITCH_X_MIN)) * 105}
                cy={(PITCH_Y_MAX - ballCarrier.y) / (PITCH_Y_MAX - PITCH_Y_MIN) * 68}
                r={1.6}
                fill="#ffffff"
                stroke="rgba(0,0,0,0.7)"
                strokeWidth={0.4}
              />
            )}
          </svg>
        </div>

        <div className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 p-4 text-sm text-zinc-100 lg:w-80 lg:shrink-0">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Recommendation
          </h3>
          {loadingRec && <p className="text-xs text-zinc-400">Computing recommendation…</p>}
          {!loadingRec && recommendation && (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-medium uppercase text-zinc-500">Best action</div>
                <div className="text-sm font-semibold capitalize text-emerald-400">
                  {recommendation.best_action}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[10px] text-zinc-500">EPV</div>
                  <div className="text-zinc-100">{recommendation.epv.toFixed(3)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500">Q_pass</div>
                  <div className="text-zinc-100">{recommendation.q_pass.toFixed(3)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500">Q_dribble</div>
                  <div className="text-zinc-100">{recommendation.q_dribble.toFixed(3)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500">Q_shoot</div>
                  <div className="text-zinc-100">{recommendation.q_shoot.toFixed(3)}</div>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase text-zinc-500">Details</div>
                <p className="mt-1 text-xs text-zinc-300">
                  Pass risk: {recommendation.explain.pass_risk.toFixed(3)} · nearest defender{" "}
                  {recommendation.explain.nearest_defender_dist.toFixed(1)}m.
                </p>
              </div>
            </div>
          )}
          {!loadingRec && !recommendation && (
            <p className="text-xs text-zinc-400">
              Drag players into a shape and click or move them to see a recommended action.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

