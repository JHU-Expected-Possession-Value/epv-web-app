"use client";

/**
 * Clip Analyzer page (CV).
 *
 * Backend behavior is extracted from `CV/newapp.py` into `epv-web-server/api/services/cv_service.py`
 * (same YOLO detect_objects, resize, homography templates, roster color heuristic).
 *
 * This page:
 * - POSTs multipart form to `/api/cv/analyze-image` (see `src/lib/api.ts` `fetchCvAnalyzeImage`)
 * - Displays JSON plus a bbox overlay: coordinates are in `image_width` × `image_height` space
 *   (backend may downscale to max width 800 like newapp); the preview img uses those dimensions
 *   so boxes align without rescaling math on the client.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import Container from "@/components/Container";
import {
  fetchCvAnalyzeImage,
  type CvAnalyzeImageResponse,
  type CvFeatureType,
} from "@/lib/api";

export default function ClipAnalyzerPage() {

  const [result, setResult] = useState<any | null>(null);

  const [playerNames, setPlayerNames] = useState<Record<number, string>>({});

  const [currentPlayer, setCurrentPlayer] = useState(0);

  const [rosterPlayers, setRosterPlayers] = useState<any[]>([]);

  const [ball, setBall] = useState<{x:number,y:number} | null>(null);

  const [featurePoints, setFeaturePoints] = useState<number[][]>([]);
  const [featureType, setFeatureType] = useState("Center Circle");

  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selected frontend inputs (sent to backend CV endpoint).
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [rosterCsv, setRosterCsv] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // const [result, setResult] = useState<CvAnalyzeImageResponse | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const [stage, setStage] = useState("upload");

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // `CV/newapp.py` is a Streamlit UX that is primarily visual (annotated image + click workflow).
  // The website preserves the same backend inference outputs (YOLO boxes, ball center, optional
  // homography + field-projected meters), but intentionally *does not* dump raw JSON to users.
  // A debug toggle is kept for developers to inspect the raw response when needed.
  const isDev = process.env.NODE_ENV !== "production";

  const previewUrl = useMemo(() => {
    if (!imageFile) return null;
    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!result || !canvasRef.current || !previewUrl) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    if (!previewUrl) return;
    img.src = previewUrl;

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      // 🔶 DRAW PLAYER BOXES
      result.players.forEach((p, i) => {
        ctx.strokeStyle = i === currentPlayer ? "green" : "yellow";
        ctx.lineWidth = 2;

        ctx.strokeRect(
          p.x1,
          p.y1,
          p.x2 - p.x1,
          p.y2 - p.y1
        );
      });

      // 🔴 DRAW BALL
      if (ball) {
        ctx.fillStyle = "red";

        ctx.beginPath();
        ctx.arc(ball.x, ball.y, 8, 0, 2 * Math.PI);
        ctx.fill();
      }

      featurePoints.forEach((pt, i) => {
        ctx.fillStyle = "cyan";

        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 6, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = "white";
        ctx.font = "16px Arial";
        ctx.fillText(`P${i + 1}`, pt[0] + 10, pt[1]);
      });
    };
  }, [result, currentPlayer, ball, featurePoints, previewUrl]);

const handleAnalyze = async () => {
  if (!imageFile) return;

  try {
    setLoading(true);

    const formData = new FormData();

    formData.append("image", imageFile);

    if (rosterCsv) {
      formData.append("roster", rosterCsv);
    }

    const response = await fetch(
      "http://localhost:8000/analyze",
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error("Analysis failed");
    }

    const data = await response.json();

    console.log(data);

    setResult(data);

    if (data.ball) {
      setBall({
        x: data.ball.x,
        y: data.ball.y,
      });
    }

    setStage("assign_players");

  } catch (err) {
    console.error(err);
  } finally {
    setLoading(false);
  }
};


  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      setFileName(file.name);
      setImageFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith("image/") || file.name.match(/\.(png|jpe?g)$/i))) {
      setFileName(file.name);
      setImageFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const runHomography = async () => {
    if (!imageFile || !ball) return;

    try {
      setLoading(true);

      const formData = new FormData();

      formData.append("image", imageFile);

      if (rosterCsv) {
        formData.append("roster", rosterCsv);
      }

      formData.append("feature_type", featureType);

      formData.append(
        "feature_points",
        JSON.stringify(featurePoints)
      );

      formData.append("ball_x", ball.x.toString());
      formData.append("ball_y", ball.y.toString());

      const response = await fetch(
        "http://localhost:8000/compute-homography",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error("Homography computation failed");
      }

      const data = await response.json();
      console.log(data);
      setResult(data);
      
      setStage("results");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;

    // Get canvas position on screen
    const rect = canvas.getBoundingClientRect();

    // Convert click position into canvas coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // STEP: BALL SELECTION
    if (stage === "ball") {
      setBall({
        x: Math.round(x),
        y: Math.round(y),
      });

      return;
    }

    // STEP: CALIBRATION
    if (stage === "calibrate") {
      if (featurePoints.length >= 4) return;

      setFeaturePoints([
        ...featurePoints,
        [Math.round(x), Math.round(y)],
      ]);
    }
  };

  const parseRosterCsv = async (file: File) => {
    const text = await file.text();

    const lines = text.split("\n");

    const parsed = lines
      .slice(1)
      .map((line) => {
        const cols = line.split(",");

        return {
          name: cols[0]?.trim(),
          number: cols[1]?.trim(),
          team: cols[2]?.trim(),
        };
      })
      .filter((p) => p.name);

    setRosterPlayers(parsed);
  };

  return (
    <Container>
      <div className="py-16">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Computer Vision Clip Analyzer
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Upload a broadcast image and get CV detections from the backend.
        </p>

        <div className="mt-12 space-y-8">
          {stage === "upload" && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`
                relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-16 transition-colors
                ${
                  isDragging
                    ? "border-zinc-400 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/50"
                    : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                }
              `}
            >
              <div className="text-center">
                <svg
                  className="mx-auto h-12 w-12 text-zinc-400 dark:text-zinc-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="mt-4 text-lg font-medium text-zinc-900 dark:text-white">
                  {fileName || "Drag & drop an image here"}
                </p>
                {fileName && (
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {fileName}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-6 rounded-lg bg-zinc-900 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Choose File
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>
          )}
          {stage === "upload" && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                Analysis Inputs
              </h2>
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Roster CSV - Name, Number, Team, Jersey Hex Code
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] ?? null;

                      setRosterCsv(file);

                      if (file) {
                        await parseRosterCsv(file);
                      }
                    }}
                    className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Homography feature type
                  </label>
                  <select
                    value={featureType}
                    onChange={(e) => setFeatureType(e.target.value as CvFeatureType | "")}
                    className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <option value="">None</option>
                    <option value="Center Circle">Center Circle</option>
                    <option value="Penalty Box">Penalty Box</option>
                    <option value="Sideline">Sideline</option>
                  </select>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={!imageFile || loading}
                  className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                >
                  {loading ? "Analyzing…" : "Run analysis"}
                </button>
                {error && (
                  <span className="text-sm text-red-600 dark:text-red-400">
                    {error}
                  </span>
                )}
              </div>
            </div>
          )}
          {stage !== "upload" && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                Analysis Results
              </h2>
              <div className="mt-6 space-y-6">
                <section>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                    Detections summary
                  </h3>
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                    {result
                      ? `Detected ${result.players.length} player(s)${
                          result.ball ? " and a ball" : ""
                        } at analysis size ${result.image_width}×${result.image_height}.`
                      : "Run analysis to see detections."}
                  </p>
                </section>
                {result?.recommendation && (
                  <section>
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                      Recommended next action
                    </h3>
                    <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-200">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                          {result.recommendation.action}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                            {result.recommendation.is_model_based ? "MODEL-BASED" : "HEURISTIC"}
                          </span>
                          <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                            strength {Math.round(result.recommendation.strength * 100)}%
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                        {result.recommendation.explanation}
                      </p>
                      {/* Recommendation caveat:
                          This card is intentionally compact and does not dump JSON. The backend
                          explicitly marks whether the recommendation is model-based or heuristic,
                          and includes limitations because a single image lacks temporal context. */}
                      {result.recommendation.limitations &&
                        result.recommendation.limitations.length > 0 && (
                          <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                            <div className="font-semibold text-zinc-800 dark:text-zinc-100">
                              Limitations (single image)
                            </div>
                            <ul className="mt-2 list-disc space-y-1 pl-4">
                              {result.recommendation.limitations.slice(0, 4).map((l, i) => (
                                <li key={i}>{l}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </div>
                  </section>
                )}
                {stage !== "upload" && result && (
                  <section>
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                      Preview (boxes in analysis coordinates)
                    </h3>

                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Image is drawn at the same width/height the backend used so YOLO boxes line up.
                    </p>

                    {stage === "ball" && (
                      <p className="mt-3 text-sm text-red-500">
                        Click on the ball location.
                      </p>
                    )}

                    {stage === "calibrate" && (
                      <p className="mt-3 text-sm text-cyan-500">
                        Click 4 field calibration points.
                      </p>
                    )}
                    <div
                      className="relative mt-3 inline-block max-w-full overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700"
                      style={{
                        width: result.image_width,
                        maxWidth: "100%",
                      }}
                    >
                      <canvas
                        ref={canvasRef}
                        onClick={handleCanvasClick}
                        width={result.image_width}
                        height={result.image_height}
                        className="block h-auto max-w-full"
                      />
                    </div>
                  </section>

                  
                )}

                {stage === "assign_players" && result && (
                  <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">

                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                      Assign Players
                    </h3>

                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      Select the correct player for each highlighted detection.
                    </p>

                    {result.players[currentPlayer] && (
                      <div className="mt-6 space-y-4">

                        <div className="text-sm text-zinc-600 dark:text-zinc-300">
                          Player {currentPlayer + 1} of {result.players.length}
                        </div>

                        {/* TEAM */}
                        <div>
                          <label className="text-sm font-medium">
                            Team
                          </label>

                          <select
                            className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                          >
                            {[...new Set(rosterPlayers.map((p) => p.team))].map((team) => (
                              <option key={team} value={team}>
                                {team}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* PLAYER */}
                        <div>
                          <label className="text-sm font-medium">
                            Player Name
                          </label>

                          <select
                            value={playerNames[currentPlayer] || ""}
                            onChange={(e) =>
                              setPlayerNames({
                                ...playerNames,
                                [currentPlayer]: e.target.value,
                              })
                            }
                            className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                          >
                            <option value="">Select player</option>

                            {rosterPlayers.map((p) => (
                              <option key={p.name} value={p.name}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* NAVIGATION */}
                        <div className="flex gap-3">

                          <button
                            disabled={currentPlayer === 0}
                            onClick={() =>
                              setCurrentPlayer(currentPlayer - 1)
                            }
                            className="rounded-lg bg-zinc-700 px-4 py-2 text-white disabled:opacity-50"
                          >
                            ← Back
                          </button>

                          <button
                            onClick={() => {
                              if (currentPlayer < result.players.length - 1) {
                                setCurrentPlayer(currentPlayer + 1);
                              } else {
                                setStage("ball");
                              }
                            }}
                            className="rounded-lg bg-emerald-600 px-4 py-2 text-white"
                          >
                            {currentPlayer < result.players.length - 1
                              ? "Next Player →"
                              : "Done → Ball"}
                          </button>

                        </div>

                      </div>
                    )}

                  </section>
                )}
                <section>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                    Players (detections)
                  </h3>
                  {!result ? (
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      No results yet.
                    </p>
                  ) : (
                    <div className="mt-2 overflow-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                      <table className="min-w-full text-left text-xs">
                        <thead className="sticky top-0 bg-zinc-50 text-[11px] text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
                          <tr>
                            <th className="px-3 py-2 font-semibold">#</th>
                            <th className="px-3 py-2 font-semibold">Team guess</th>
                            <th className="px-3 py-2 font-semibold">Center (px)</th>
                            <th className="px-3 py-2 font-semibold">BBox (px)</th>
                            <th className="px-3 py-2 font-semibold">Field (m)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 text-zinc-700 dark:divide-zinc-800 dark:text-zinc-200">
                          {result.players.slice(0, 60).map((p, idx) => {
                            const w = p.x2 - p.x1;
                            const h = p.y2 - p.y1;
                            const hasField =
                              p.field_x_m != null &&
                              p.field_y_m != null &&
                              Number.isFinite(p.field_x_m) &&
                              Number.isFinite(p.field_y_m);
                            return (
                              <tr key={idx} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30">
                                <td className="px-3 py-2 tabular-nums text-zinc-500 dark:text-zinc-400">
                                  {idx + 1}
                                </td>
                                <td className="px-3 py-2">
                                  {p.team_guess ? (
                                    <span className="inline-flex items-center gap-2">
                                      <span className="font-medium">{p.team_guess}</span>
                                      {p.team_guess_distance != null ? (
                                        <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                                          d={p.team_guess_distance.toFixed(1)}
                                        </span>
                                      ) : null}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-400">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 tabular-nums">
                                  ({p.center_x}, {p.center_y})
                                </td>
                                <td className="px-3 py-2 tabular-nums">
                                  x={p.x1}, y={p.y1}, w={w}, h={h}
                                </td>
                                <td className="px-3 py-2 tabular-nums">
                                  {hasField ? (
                                    <>
                                      ({p.field_x_m!.toFixed(1)}, {p.field_y_m!.toFixed(1)})
                                    </>
                                  ) : (
                                    <span className="text-zinc-400">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {result.players.length > 60 && (
                        <div className="border-t border-zinc-100 px-3 py-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                          Showing first 60 detections.
                        </div>
                      )}
                    </div>
                  )}
                </section>
                <section>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                    Ball + Homography
                  </h3>
                  {!result ? (
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      No results yet.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                      <div>
                        <span className="font-medium">Ball:</span>{" "}
                        {result.ball ? `(${result.ball.x}, ${result.ball.y})` : "Not detected"}
                        {result.ball && result.ball.field_x_m != null && result.ball.field_y_m != null ? (
                          <span className="ml-2 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                            field=({result.ball.field_x_m.toFixed(1)}, {result.ball.field_y_m.toFixed(1)})
                          </span>
                        ) : null}
                      </div>
                      <div>
                        <span className="font-medium">Homography:</span>{" "}
                        {result.homography ? "Computed" : "None (no field projection)"}
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          Matches the Streamlit flow in `CV/newapp.py`: homography is only computed when you provide a supported
                          feature type + exactly 4 feature points in the analyzed image coordinate system.
                        </p>
                      </div>
                      {result.homography && (
                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">
                          <div className="font-semibold">Calibration points (projected to field)</div>
                          <div className="mt-2 grid gap-1 tabular-nums sm:grid-cols-2">
                            {result.homography.projected_points.slice(0, 4).map((pt, i) => (
                              <div key={i} className="text-[11px] text-zinc-600 dark:text-zinc-300">
                                {i + 1}. ({pt[0].toFixed(2)}, {pt[1].toFixed(2)})
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* Developer-only debug view for raw backend response.
                    The website UX intentionally hides JSON dumps: the intended output (see `CV/newapp.py`)
                    is the annotated image + simple detection summaries, not raw structures. */}
                {isDev && result && (
                  <section>
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                        Debug (raw response)
                      </h3>
                      <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-zinc-400 text-emerald-600 focus:ring-emerald-500"
                          checked={showDebug}
                          onChange={(e) => setShowDebug(e.target.checked)}
                        />
                        Show raw JSON
                      </label>
                    </div>
                    {showDebug && (
                      <div className="mt-2 max-h-[260px] overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(result, null, 2)}
                        </pre>
                      </div>
                    )}
                  </section>
                )}
                <div className="mt-6 flex gap-3">
                  {stage === "assign_players" && result && (
                    <button
                      onClick={() => setStage("ball")}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-white"
                    >
                      Next → Ball
                    </button>
                  )}

                  {stage === "ball" && (
                    <button
                      onClick={() => setStage("calibrate")}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-white"
                    >
                      Next → Calibrate
                    </button>
                  )}

                  {stage === "calibrate" && (
                    <button
                      onClick={runHomography}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-white"
                    >
                      Finish → Results
                    </button>
                  )}

                  {stage === "calibrate" && (
                    <button
                      onClick={() => setFeaturePoints([])}
                      className="rounded-lg bg-red-600 px-4 py-2 text-white"
                    >
                      Reset Points
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}
