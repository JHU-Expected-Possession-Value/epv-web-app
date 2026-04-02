"use client";

import type { RenderFrame } from "@/lib/api";

const PITCH_WIDTH = 105;
const PITCH_HEIGHT = 68;
const ORIGIN_X = 52.5;
const ORIGIN_Y = 34;

function dataToSvg(x: number, y: number) {
  return { x: x + ORIGIN_X, y: ORIGIN_Y - y };
}

const PLAYER_R = 3.2;
const BALL_R = 1.8;
const HOME_COLOR = "rgb(59, 130, 246)";
const AWAY_COLOR = "rgb(234, 179, 8)";
const BALL_FILL = "white";
const BALL_STROKE = "rgba(0,0,0,0.65)";

function PitchLines() {
  const half = PITCH_WIDTH / 2;
  const penDepth = 16.5;
  const penHalfW = 20.16;
  const goalDepth = 5.5;
  const goalHalfW = 9.16;
  const centerR = 9.15;
  return (
    <g stroke="currentColor" strokeWidth="0.4" fill="none" className="text-zinc-400 dark:text-zinc-600">
      <rect x={0} y={0} width={PITCH_WIDTH} height={PITCH_HEIGHT} />
      <line x1={half} y1={0} x2={half} y2={PITCH_HEIGHT} />
      <circle cx={half} cy={PITCH_HEIGHT / 2} r={centerR} />
      <rect x={0} y={PITCH_HEIGHT / 2 - penHalfW} width={penDepth} height={penHalfW * 2} />
      <rect x={PITCH_WIDTH - penDepth} y={PITCH_HEIGHT / 2 - penHalfW} width={penDepth} height={penHalfW * 2} />
      <rect x={0} y={PITCH_HEIGHT / 2 - goalHalfW} width={goalDepth} height={goalHalfW * 2} />
      <rect x={PITCH_WIDTH - goalDepth} y={PITCH_HEIGHT / 2 - goalHalfW} width={goalDepth} height={goalHalfW * 2} />
    </g>
  );
}

function playerFill(
  teamId: number | null,
  homeTeamId: number | null,
  awayTeamId: number | null
): string {
  if (teamId != null && homeTeamId != null && teamId === homeTeamId) return HOME_COLOR;
  if (teamId != null && awayTeamId != null && teamId === awayTeamId) return AWAY_COLOR;
  return HOME_COLOR;
}

export type LiveBoardPitchProps = {
  /** 10v10 filtered players (no GKs) */
  players: { id: number | null; team_id: number | null; x: number; y: number }[];
  ball: { x: number; y: number } | null;
  possessorId: number | null;
  homeTeamId: number | null;
  awayTeamId: number | null;
  /** Player id -> display name for possessor label */
  rosterNames?: Map<number, string>;
  showHeatmap?: boolean;
  /** Optional EPV grid (e.g. 21x14). Values 0–1. */
  epvMap?: number[][] | null;
  className?: string;
};

export default function LiveBoardPitch({
  players,
  ball,
  possessorId,
  homeTeamId,
  awayTeamId,
  rosterNames,
  showHeatmap = false,
  epvMap = null,
  className = "",
}: LiveBoardPitchProps) {
  const ballSvg = ball ? dataToSvg(ball.x, ball.y) : null;
  const playersSvg = players.map((p) => ({ ...p, ...dataToSvg(p.x, p.y) }));

  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/80 dark:border-zinc-600 dark:bg-zinc-900 ${className}`}
      style={{ aspectRatio: `${PITCH_WIDTH} / ${PITCH_HEIGHT}` }}
    >
      <div className="mb-1 flex flex-wrap items-center gap-4 text-[10px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full border border-black/30" style={{ backgroundColor: HOME_COLOR }} />
          Home
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full border border-black/30" style={{ backgroundColor: AWAY_COLOR }} />
          Away
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full border border-black/50" style={{ backgroundColor: BALL_FILL }} />
          Ball
        </span>
      </div>
      <svg
        viewBox={`0 0 ${PITCH_WIDTH} ${PITCH_HEIGHT}`}
        className="block h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <PitchLines />
        {/* Optional EPV heatmap overlay */}
        {showHeatmap && epvMap && epvMap.length > 0 && epvMap[0]?.length > 0 && (
          <g opacity={0.35}>
            {epvMap.map((row, i) =>
              row.map((v, j) => {
                const x = (j / (row.length - 1 || 1)) * PITCH_WIDTH;
                const y = (i / (epvMap.length - 1 || 1)) * PITCH_HEIGHT;
                const w = PITCH_WIDTH / (row.length || 1);
                const h = PITCH_HEIGHT / (epvMap.length || 1);
                const green = Math.round(100 + v * 155);
                return (
                  <rect
                    key={`${i}-${j}`}
                    x={x}
                    y={y}
                    width={w + 0.5}
                    height={h + 0.5}
                    fill={`rgba(16, ${green}, 129, ${0.2 + v * 0.5})`}
                  />
                );
              })
            )}
          </g>
        )}
        {showHeatmap && !epvMap && (
          <g opacity={0.2}>
            {/* Placeholder: gradient by x (attack direction) */}
            {Array.from({ length: 21 }).map((_, i) =>
              Array.from({ length: 14 }).map((_, j) => {
                const x = (i / 20) * PITCH_WIDTH;
                const y = (j / 13) * PITCH_HEIGHT;
                const v = i / 20;
                return (
                  <rect
                    key={`${i}-${j}`}
                    x={x}
                    y={y}
                    width={PITCH_WIDTH / 20 + 0.5}
                    height={PITCH_HEIGHT / 13 + 0.5}
                    fill={`rgba(16, ${100 + Math.round(v * 155)}, 129, ${0.15 + v * 0.4})`}
                  />
                );
              })
            )}
          </g>
        )}
        {playersSvg.map((p, i) => {
          const isHighlight = possessorId != null && p.id != null && p.id === possessorId;
          return (
            <g key={p.id ?? i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={PLAYER_R}
                fill={playerFill(p.team_id, homeTeamId, awayTeamId)}
                stroke={isHighlight ? "rgb(16, 185, 129)" : "rgba(0,0,0,0.4)"}
                strokeWidth={isHighlight ? 1.2 : 0.35}
              />
              {isHighlight && rosterNames?.get(p.id!) != null && (
                <text
                  x={p.x}
                  y={p.y - PLAYER_R - 1.2}
                  textAnchor="middle"
                  className="fill-emerald-400 text-[2.5px] font-semibold"
                >
                  {rosterNames.get(p.id!)}
                </text>
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
