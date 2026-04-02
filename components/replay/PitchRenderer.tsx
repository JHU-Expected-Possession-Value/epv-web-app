"use client";

import type { RenderFrame } from "@/lib/api";

const PITCH_WIDTH = 105;
const PITCH_HEIGHT = 68;
const ORIGIN_X = 52.5;
const ORIGIN_Y = 34;

function dataToSvg(x: number, y: number): { x: number; y: number } {
  return { x: x + ORIGIN_X, y: ORIGIN_Y - y };
}

/** Infer possessor as nearest player to ball within 2.5m (client-side fallback when no derived_possession). */
function inferPossessorId(frame: RenderFrame): number | null {
  const ball = frame.ball;
  if (!ball || ball.x == null || ball.y == null) return null;
  const players = frame.players ?? [];
  const maxDistSq = 2.5 * 2.5;
  let bestId: number | null = null;
  let bestD = maxDistSq;
  for (const p of players) {
    const px = p.x;
    const py = p.y;
    const d = (px - ball.x) ** 2 + (py - ball.y) ** 2;
    if (d < bestD && p.id != null) {
      bestD = d;
      bestId = p.id;
    }
  }
  return bestId;
}

// Pitch lines (FIFA: 105x68)
function PitchLines() {
  const pw = PITCH_WIDTH;
  const ph = PITCH_HEIGHT;
  const half = pw / 2;
  const penDepth = 16.5;
  const penHalfW = 20.16;
  const goalDepth = 5.5;
  const goalHalfW = 9.16;
  const centerR = 9.15;

  return (
    <g stroke="currentColor" strokeWidth="0.4" fill="none" className="text-zinc-400 dark:text-zinc-600">
      <rect x={0} y={0} width={pw} height={ph} />
      <line x1={half} y1={0} x2={half} y2={ph} />
      <circle cx={half} cy={ph / 2} r={centerR} />
      <rect x={0} y={ph / 2 - penHalfW} width={penDepth} height={penHalfW * 2} />
      <rect x={pw - penDepth} y={ph / 2 - penHalfW} width={penDepth} height={penHalfW * 2} />
      <rect x={0} y={ph / 2 - goalHalfW} width={goalDepth} height={goalHalfW * 2} />
      <rect x={pw - goalDepth} y={ph / 2 - goalHalfW} width={goalDepth} height={goalHalfW * 2} />
    </g>
  );
}

const PLAYER_R = 3.2;
const BALL_R = 1.8;

export const PITCH_HOME_COLOR = "rgb(59, 130, 246)";
export const PITCH_AWAY_COLOR = "rgb(234, 179, 8)";
const BALL_FILL = "white";
const BALL_STROKE = "rgba(0,0,0,0.65)";
const UNKNOWN_TEAM_COLOR = "rgb(148, 163, 184)";

/** Home blue, Away gold. Coerce ids to number for comparison. Unknown = slate. */
function playerFill(
  teamSide: "home" | "away" | null | undefined,
  teamId: number | null | undefined,
  homeTeamId: number | null | undefined,
  awayTeamId: number | null | undefined
): string {
  if (teamSide === "home") return PITCH_HOME_COLOR;
  if (teamSide === "away") return PITCH_AWAY_COLOR;
  const tid = teamId != null ? Number(teamId) : NaN;
  const hid = homeTeamId != null ? Number(homeTeamId) : NaN;
  const aid = awayTeamId != null ? Number(awayTeamId) : NaN;
  if (!Number.isNaN(tid) && !Number.isNaN(hid) && tid === hid) return PITCH_HOME_COLOR;
  if (!Number.isNaN(tid) && !Number.isNaN(aid) && tid === aid) return PITCH_AWAY_COLOR;
  return UNKNOWN_TEAM_COLOR;
}

export type PitchRendererProps = {
  frame: RenderFrame | null;
  home_team_id?: number | null;
  away_team_id?: number | null;
  /** When set, highlight this player (possessor) with thick ring + "P" tag. Falls back to nearest-to-ball if unset. */
  highlightPlayerId?: number | null;
  /** Optional label for the possessor (e.g. player name). */
  possessorLabel?: string | null;
  /** Optional EPV/Q overlays per teammate (by player_id). */
  teammateValues?: { player_id: number; value: number }[];
  /** Optional: highlight this teammate's EPV label (e.g. chosen pass target). */
  highlightTeammateId?: number | null;
  className?: string;
};

export default function PitchRenderer({
  frame,
  home_team_id: homeTeamId = null,
  away_team_id: awayTeamId = null,
  highlightPlayerId = null,
  possessorLabel = null,
  teammateValues,
  highlightTeammateId = null,
  className = "",
}: PitchRendererProps) {
  if (!frame) {
    return (
      <div
        className={`flex min-h-[180px] items-center justify-center rounded-lg border border-zinc-600 bg-zinc-800/50 ${className}`}
        style={{ aspectRatio: `${PITCH_WIDTH} / ${PITCH_HEIGHT}` }}
      >
        <p className="text-sm text-zinc-400">No frame to display.</p>
      </div>
    );
  }

  const { ball, players } = frame;
  const ballSvg = ball ? dataToSvg(ball.x, ball.y) : null;
  const playersSvg = (players ?? []).map((p) => ({ ...p, ...dataToSvg(p.x, p.y) }));
  const possessorId = highlightPlayerId ?? frame.derived_possession?.player_id ?? inferPossessorId(frame);

  return (
    <div
      className={`overflow-hidden rounded-lg border border-zinc-600 bg-zinc-900/80 ${className}`}
      style={{ aspectRatio: `${PITCH_WIDTH} / ${PITCH_HEIGHT}` }}
    >
      <div className="flex items-center gap-3 px-1 py-0.5 text-[10px] text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full border border-black/30" style={{ backgroundColor: PITCH_HOME_COLOR }} />
          Home
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full border border-black/30" style={{ backgroundColor: PITCH_AWAY_COLOR }} />
          Away
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1 w-1 rounded-full border border-black/50" style={{ backgroundColor: BALL_FILL }} />
          Ball
        </span>
        {possessorId != null && (
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-emerald-500 text-[9px] font-bold">P</span>
            Possessor
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${PITCH_WIDTH} ${PITCH_HEIGHT}`}
        className="block h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <PitchLines />
        {playersSvg.map((p, i) => {
          const isPossessor =
            possessorId != null &&
            p.id != null &&
            (p.id === possessorId || Number(p.id) === Number(possessorId));
          const epvEntry =
            teammateValues && p.id != null
              ? teammateValues.find(
                  (tv) =>
                    tv.player_id === p.id ||
                    Number(tv.player_id) === Number(p.id)
                )
              : undefined;
          const showEpvLabel = epvEntry && !isPossessor;
          const isHighlightedTeammate =
            showEpvLabel &&
            highlightTeammateId != null &&
            (p.id === highlightTeammateId ||
              Number(p.id) === Number(highlightTeammateId));
          return (
            <g key={p.id ?? i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={PLAYER_R}
                fill={playerFill(p.team_side ?? null, p.team_id ?? null, homeTeamId, awayTeamId)}
                stroke={isPossessor ? "rgb(16, 185, 129)" : "rgba(0,0,0,0.35)"}
                strokeWidth={isPossessor ? 1.2 : 0.35}
              />
              {showEpvLabel && (
                <text
                  x={p.x}
                  y={p.y - PLAYER_R - 1.0}
                  textAnchor="middle"
                  className={`text-[2.6px] ${
                    isHighlightedTeammate
                      ? "fill-amber-300 font-semibold"
                      : "fill-zinc-200"
                  }`}
                >
                  {epvEntry!.value.toFixed(3)}
                </text>
              )}
              {isPossessor && (
                <>
                  <text
                    x={p.x}
                    y={p.y - PLAYER_R - 1.4}
                    textAnchor="middle"
                    className="fill-emerald-400 text-[3.2px] font-bold"
                  >
                    P
                  </text>
                  {possessorLabel && (
                    <text
                      x={p.x}
                      y={p.y + PLAYER_R + 2.2}
                      textAnchor="middle"
                      className="fill-zinc-300 text-[2.8px]"
                    >
                      {possessorLabel}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
        {ballSvg && (
          <circle
            cx={ballSvg.x}
            cy={ballSvg.y}
            r={BALL_R}
            fill={BALL_FILL}
            stroke={BALL_STROKE}
            strokeWidth="0.4"
          />
        )}
      </svg>
    </div>
  );
}
