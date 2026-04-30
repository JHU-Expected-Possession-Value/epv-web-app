// lib/api.ts
//
// Purpose (this phase):
// - Centralize frontend → backend calls for the AWS-backed FastAPI server
// - Keep the frontend render-only: all DB queries/model inference/CV live in the backend

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET ${path} failed: ${res.status} ${res.statusText}${
        text ? ` - ${text}` : ""
      }`
    );
  }
  return res.json();
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...init?.headers },
    body: JSON.stringify(body),
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `POST ${path} failed: ${res.status} ${res.statusText}${
        text ? ` - ${text}` : ""
      }`
    );
  }
  return res.json();
}

export async function apiPostForm<T>(
  path: string,
  form: FormData,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: form,
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `POST ${path} failed: ${res.status} ${res.statusText}${
        text ? ` - ${text}` : ""
      }`
    );
  }
  return res.json();
}

// ---- Replay API helpers ----

export type ReplayTeamInfo = {
  id?: number | null;
  name?: string | null;
  short_name?: string | null;
};

export type ReplayMatch = {
  match_id: string;
  home_team: ReplayTeamInfo;
  away_team: ReplayTeamInfo;
  label: string;
  // Replayability is computed by the backend by checking required DB tables:
  // `events` (moments) + `frame`/`detection` (tracking). The replay UI can
  // filter out non-replayable matches or display a clean reason string.
  replayable?: boolean;
  replayability_reason?: string | null;
};

export type ReplayMatchesResponse = {
  matches: ReplayMatch[];
};

export type ReplayMoment = {
  moment_id: string;
  match_id: string;
  period: number;
  team_possession_phase_index?: number | null;
  frame_start: number;
  frame_end: number;
  frame: number; // same as frame_end, for center_frame
  minute_start?: number | null;
  second_start?: number | null;
  time_label?: string | null; // "MM:SS"
  team_id?: number | null;
  team_shortname?: string | null;
  attacking_side?: string | null;
  player_id?: number | null;
  player_name?: string | null;
  event_type?: string | null;
  event_subtype?: string | null;
  end_type?: string | null;
  pass_outcome?: string | null;
  turnover_type: string;
};

export type ReplayMomentsResponse = {
  match_id: string;
  count: number;
  moments: ReplayMoment[];
  dedupe_debug?: {
    reason: string;
    period?: number | null;
    team_id?: number | null;
    player_id?: number | null;
    event_type_group?: string;
    time_bucket?: number;
    game_time_seconds?: number;
    delta_t?: number;
  }[];
};

export type ReplayTrackingWindowResponse = {
  match_id: string;
  center_frame: number;
  start_frame: number;
  end_frame: number;
  frames: unknown[];
};

// Render-ready tracking window (normalized pitch coords: x in [-52.5,52.5], y in [-34,34])
export type RenderBall = {
  x: number;
  y: number;
  z?: number | null;
};

export type RenderPlayer = {
  id: number | null;
  team_id: number | null;
  team_side?: "home" | "away" | null;
  /** Full player name (resolved server-side from the players table). */
  name?: string | null;
  x: number;
  y: number;
  speed?: number | null;
};

export type DerivedPossession = {
  team_id: number | null;
  player_id: number | null;
  player_name?: string | null;
  team_side?: "home" | "away" | null;
};

export type RenderFrame = {
  frame: number;
  period: number | null;
  timestamp: string | null;
  ball: RenderBall | null;
  players: RenderPlayer[];
  derived_possession?: DerivedPossession | null;
  /** Number of players actually present in this frame BEFORE backend forward-fill. */
  raw_player_count?: number | null;
  /** True if `players` was filled in from a neighbouring frame (raw was sparse/empty). */
  players_filled?: boolean | null;
};

export type TrackingRenderWindow = {
  match_id: string;
  center_frame: number;
  effective_center_frame?: number;
  start_frame: number;
  end_frame: number;
  frames: RenderFrame[];
};

// ---- Counterfactual (v1 placeholder) ----

export type CounterfactualRecommendedAction = {
  type: "pass" | "shot" | "carry";
  description: string;
  target_player_id?: number | null;
};

export type CounterfactualOverlay = {
  kind: "lane";
  from: { x: number; y: number };
  to: { x: number; y: number };
};

export type CounterfactualResponse = {
  recommended_action: CounterfactualRecommendedAction;
  recommended_description?: string | null;
  epv_original: number | null;
  epv_recommended: number | null;
  epv_delta: number | null;
  overlay: CounterfactualOverlay | null;
};

export async function fetchCounterfactual(
  matchId: string,
  momentId: string,
  centerFrame: number,
  eventType?: string,
  teamSide?: string | null,
  playerId?: number | null
): Promise<CounterfactualResponse> {
  return apiPost<CounterfactualResponse>("/replay/counterfactual", {
    match_id: matchId,
    moment_id: momentId,
    center_frame: centerFrame,
    ...(eventType != null && eventType !== "" ? { event_type: eventType } : {}),
    ...(teamSide != null && teamSide !== "" ? { team_side: teamSide } : {}),
    ...(playerId != null ? { player_id: playerId } : {}),
  });
}

export async function fetchReplayMatches(): Promise<ReplayMatchesResponse> {
  // Prefer filtering out non-replayable matches server-side so the replay UI
  // only offers matches that have both events and tracking loaded.
  return apiGet<ReplayMatchesResponse>("/replay/matches?replayable_only=1");
}

/** Fetch deduped + paginated replay moments (limit/offset). */
export async function fetchReplayMoments(
  matchId: string,
  limit = 50,
  offset = 0,
  debug = false
): Promise<ReplayMomentsResponse> {
  const params = new URLSearchParams({
    match_id: matchId,
    limit: String(limit),
    offset: String(offset),
  });
  if (debug) {
    params.set("debug", "1");
  }
  return apiGet<ReplayMomentsResponse>(`/replay/moments?${params.toString()}`);
}

export async function fetchTrackingWindow(
  matchId: string,
  centerFrame: number,
  radius = 60
): Promise<ReplayTrackingWindowResponse> {
  const params = new URLSearchParams({
    match_id: matchId,
    center_frame: String(centerFrame),
    radius: String(radius),
  });
  return apiGet<ReplayTrackingWindowResponse>(
    `/replay/tracking_window?${params.toString()}`
  );
}

export async function fetchTrackingWindowRender(
  matchId: string,
  centerFrame: number,
  radius = 60,
  includePlayers = 1,
  maxFrames = 120
): Promise<TrackingRenderWindow> {
  const params = new URLSearchParams({
    match_id: matchId,
    center_frame: String(centerFrame),
    radius: String(radius),
    include_players: String(includePlayers),
    max_frames: String(maxFrames),
  });
  return apiGet<TrackingRenderWindow>(
    `/replay/tracking_window_render?${params.toString()}`
  );
}

// ---- Recommend (simplified) ----

export type RecommendTarget = {
  player_id?: number | null;
  x?: number | null;
  y?: number | null;
};

export type RecommendResponse = {
  recommendation: {
    text: string;
    action: string;
    target?: RecommendTarget | null;
    target_player_id?: number | null;
    target_player_name?: string | null;
    target_point?: { x: number; y: number } | null;
    summary?: string | null;
    /** What the player actually did (mapped from event_type). */
    actual_action?: "pass" | "dribble" | "shoot" | null;
    actual_phrase?: string | null;
    recommended_phrase?: string | null;
    possessor_name?: string | null;
    epv_delta_est?: number | null;
  };
  overlay: CounterfactualOverlay | null;
  epv: {
    /** Backward-compat alias for epv_actual. */
    epv_original: number;
    /** EPV of the action the player actually took. */
    epv_actual?: number;
    /** EPV of the model's recommended action. */
    epv_recommended: number;
    /** epv_recommended - epv_actual (positive means recommendation is better). */
    epv_delta: number;
    actual_action?: "pass" | "dribble" | "shoot" | null;
    recommended_action?: "pass" | "dribble" | "shoot" | null;
    q_pass?: number;
    q_dribble?: number;
    q_shoot?: number;
  };
  decision_frame?: number | null;
  teammate_overlays?: {
    player_id: number;
    x: number;
    y: number;
    epv_value: number;
    pass_score: number;
    is_best_target: boolean;
  }[];
  chosen_target_player_id?: number | null;
  fallback_reason?: string | null;
};

export async function fetchRecommend(
  matchId: string,
  momentId: string,
  centerFrame: number,
  eventType?: string,
  teamSide?: string | null,
  playerId?: number | null
): Promise<RecommendResponse> {
  return apiPost<RecommendResponse>("/replay/recommend", {
    match_id: matchId,
    moment_id: momentId,
    center_frame: centerFrame,
    ...(eventType != null && eventType !== "" ? { event_type: eventType } : {}),
    ...(teamSide != null && teamSide !== "" ? { team_side: teamSide } : {}),
    ...(playerId != null ? { player_id: playerId } : {}),
  });
}

// ---- Resimulate (Option A: original + resimulated, derived_possession) ----

export type ResimulateOptionARecommendation = {
  action: "short_safe_pass" | "carry_to_space";
  target_player_id?: number | null;
  target_point?: { x: number; y: number } | null;
};

export type ResimulateOptionAResponse = {
  match_id: string;
  mode: "synthetic";
  original: {
    center_frame: number;
    range: [number, number];
    frames: RenderFrame[];
  };
  resimulated: {
    center_frame: number;
    range: [number, number];
    frames: RenderFrame[];
  };
  meta: {
    possessor_player_id?: number | null;
    team_id?: number | null;
    epv_original: number;
    epv_resim: number;
    epv_delta: number;
  };
};

// ---- Live Board ----

export type LiveMatchInfo = {
  match_id: string;
  home_team: { id?: number; name?: string; short_name?: string };
  away_team: { id?: number; name?: string; short_name?: string };
  label: string;
};

export type LiveRosterPlayer = {
  player_id: number;
  name: string;
  team: "home" | "away";
  position: string;
  is_goalkeeper: boolean;
};

export type LiveRangeResponse = {
  start_frame: number;
  end_frame: number;
  first_valid_frame: number;
};

/** Single frame with derived_possession for Live Board. */
export type LiveFrameResponse = RenderFrame;

export type LiveEvalPassTarget = {
  player_id: number;
  name: string;
  value_delta: number;
};

export type LiveEvalResponse = {
  epv: number;
  best_action: "pass" | "dribble" | "shoot";
  q_pass: number;
  q_dribble: number;
  q_shoot: number;
  top_3_pass_targets: LiveEvalPassTarget[];
  epv_map?: number[][] | null;
};

// Legacy Live Board / live eval helpers (still used by dashboard page).
// These wrap the existing /api/live/* endpoints exposed by the backend.

export async function fetchLiveMatches(): Promise<{ matches: LiveMatchInfo[] }> {
  return apiGet<{ matches: LiveMatchInfo[] }>("/api/live/matches");
}

export async function fetchLiveRoster(
  matchId: string
): Promise<{ players: LiveRosterPlayer[] }> {
  const params = new URLSearchParams({ match_id: matchId });
  return apiGet<{ players: LiveRosterPlayer[] }>(
    `/api/live/roster?${params.toString()}`
  );
}

export async function fetchLiveRange(
  matchId: string
): Promise<LiveRangeResponse> {
  const params = new URLSearchParams({ match_id: matchId });
  return apiGet<LiveRangeResponse>(
    `/api/live/range?${params.toString()}`
  );
}

export async function fetchLiveFrame(
  matchId: string,
  frame: number
): Promise<LiveFrameResponse> {
  const params = new URLSearchParams({
    match_id: matchId,
    frame: String(frame),
  });
  return apiGet<LiveFrameResponse>(
    `/api/live/frame?${params.toString()}`
  );
}

export async function fetchLiveEval(
  matchId: string,
  frame: number,
  possessorPlayerId: number
): Promise<LiveEvalResponse> {
  return apiPost<LiveEvalResponse>("/api/live/eval", {
    match_id: matchId,
    frame,
    possessor_player_id: possessorPlayerId,
  });
}

export type TacticsPlayerIn = {
  player_id: string;
  x: number; // center coords
  y: number;
  pos?: string;
};

export type TacticsRecommendationRequest = {
  ball_carrier: {
    player_id: string;
    x: number;
    y: number;
    team: "home" | "away";
    pass_skill?: number;
    dribble_skill?: number;
    shot_skill?: number;
  };
  home: TacticsPlayerIn[];
  away: TacticsPlayerIn[];
};

export type TacticsTarget = {
  type: "player" | "point" | "goal";
  x: number;
  y: number;
  player_id?: string | null;
};

export type TacticsExplain = {
  pass_risk: number;
  nearest_defender_dist: number;
};

export type TacticsRecommendationResponse = {
  epv: number;
  best_action: "pass" | "dribble" | "shoot";
  q_pass: number;
  q_dribble: number;
  q_shoot: number;
  target: TacticsTarget;
  explain: TacticsExplain;
};

export type TacticsRosterPlayer = {
  player_id: number;
  name: string;
  team: string;
  team_name: string;
  position: string;
  pass_skill: number;
  dribble_skill: number;
  shot_skill: number;
};

export async function fetchTacticsRecommendation(
  payload: TacticsRecommendationRequest
): Promise<TacticsRecommendationResponse> {
  return apiPost<TacticsRecommendationResponse>("/api/tactics/recommendation", payload);
}

export type TacticsTeam = { team_id: number; team_name?: string | null };

export type TacticsPlayer = {
  player_id: number;
  name: string;
  position?: string | null;
  team_id?: number | null;
  team_name?: string | null;
  pass_skill: number;
  dribble_skill: number;
  shot_skill: number;
};

export async function fetchTacticsTeams(): Promise<TacticsTeam[]> {
  return apiGet<TacticsTeam[]>("/api/tactics/teams");
}

export async function fetchTacticsPlayers(teamId: number): Promise<TacticsPlayer[]> {
  const params = new URLSearchParams({ team_id: String(teamId) });
  return apiGet<TacticsPlayer[]>(`/api/tactics/players?${params.toString()}`);
}

export async function fetchTacticsRoster(): Promise<TacticsRosterPlayer[]> {
  // Legacy endpoint kept for backward compatibility.
  return apiGet<TacticsRosterPlayer[]>("/api/tactics/roster");
}

export type PlayerActionHeatmapKind = "shots" | "passes" | "carries" | "goals";
export type PlayerActionHeatmapResponse = {
  player_id: number;
  player_name: string;
  kind: PlayerActionHeatmapKind;
  cols: number;
  rows: number;
  cells: { col: number; row: number; intensity: number }[];
  note: string;
};

export async function fetchPlayerActionHeatmap(
  playerId: number,
  kind: PlayerActionHeatmapKind,
  teamSide?: "home" | "away" | null,
  cols = 12,
  rows = 8
): Promise<PlayerActionHeatmapResponse> {
  const params = new URLSearchParams({
    player_id: String(playerId),
    kind,
    cols: String(cols),
    rows: String(rows),
  });
  if (teamSide) params.set("team_side", teamSide);
  return apiGet<PlayerActionHeatmapResponse>(
    `/api/tactics/player-action-heatmap?${params.toString()}`
  );
}

// ---- CV / Clip Analyzer ----

export type CvPlayerDetection = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  center_x: number;
  center_y: number;
  team_guess?: string | null;
  team_guess_distance?: number | null;
  /** Meters on 105×68 field when homography was computed */
  field_x_m?: number | null;
  field_y_m?: number | null;
};

export type CvBallDetection = {
  x: number;
  y: number;
  field_x_m?: number | null;
  field_y_m?: number | null;
} | null;

export type CvHomography = {
  H: number[][];
  projected_points: number[][];
} | null;

export type CvAnalyzeImageResponse = {
  /** Analysis frame size (bboxes are in this coordinate space; match overlay to this size). */
  image_width: number;
  image_height: number;
  players: CvPlayerDetection[];
  ball: CvBallDetection;
  homography: CvHomography;
  // Compact CV "recommended next action" (explicitly heuristic unless stated otherwise).
  recommendation?: {
    action: string;
    explanation: string;
    /** Confidence-like heuristic strength in [0,1]. */
    strength: number;
    is_model_based: boolean;
    cues?: string[];
    limitations?: string[];
  } | null;
};

export type CvFeatureType = "Center Circle" | "Penalty Box" | "Sideline";

export async function fetchCvAnalyzeImage(params: {
  image: File;
  rosterCsv?: File | null;
  featureType?: CvFeatureType | null;
  featurePoints?: [number, number][] | null;
}): Promise<CvAnalyzeImageResponse> {
  const form = new FormData();
  form.append("image", params.image);
  if (params.rosterCsv) form.append("roster_csv", params.rosterCsv);
  if (params.featureType) form.append("feature_type", params.featureType);
  if (params.featurePoints && params.featurePoints.length > 0) {
    form.append("feature_points", JSON.stringify(params.featurePoints));
  }
  return apiPostForm<CvAnalyzeImageResponse>("/api/cv/analyze-image", form);
}

export async function fetchResimulate(
  matchId: string,
  centerFrame: number,
  recommendation: ResimulateOptionARecommendation,
  pre = 60,
  post = 90
): Promise<ResimulateOptionAResponse> {
  return apiPost<ResimulateOptionAResponse>("/replay/resimulate", {
    match_id: matchId,
    center_frame: centerFrame,
    mode: "synthetic",
    recommendation,
    pre,
    post,
  });
}