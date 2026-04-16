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
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selected frontend inputs (sent to backend CV endpoint).
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [rosterCsv, setRosterCsv] = useState<File | null>(null);
  const [featureType, setFeatureType] = useState<CvFeatureType | "">("");
  const [featurePointsRaw, setFeaturePointsRaw] = useState<string>(""); // JSON string: [[x,y],...]

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CvAnalyzeImageResponse | null>(null);
  const [showDebug, setShowDebug] = useState(false);

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

  const runAnalysis = async () => {
    if (!imageFile) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // Where frontend input is sent to backend:
      // POST `/api/cv/analyze-image` (multipart form upload)
      const pts = featurePointsRaw.trim()
        ? (JSON.parse(featurePointsRaw) as [number, number][])
        : null;
      const res = await fetchCvAnalyzeImage({
        image: imageFile,
        rosterCsv,
        featureType: featureType ? (featureType as CvFeatureType) : null,
        featurePoints: pts,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
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

          <div className="rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
              Analysis Inputs
            </h2>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Optional roster CSV (team colors)
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setRosterCsv(e.target.files?.[0] ?? null)}
                  className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Optional homography feature type
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
              <div className="lg:col-span-2">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Optional feature points JSON (4 points)
                </label>
                <textarea
                  value={featurePointsRaw}
                  onChange={(e) => setFeaturePointsRaw(e.target.value)}
                  placeholder='Example: [[123,45],[200,40],[210,180],[120,190]]'
                  className="mt-2 block min-h-[90px] w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800"
                />
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  If provided, these are sent to the backend to compute a homography.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={runAnalysis}
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
              {result && previewUrl && (
                <section>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                    Preview (boxes in analysis coordinates)
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Image is drawn at the same width/height the backend used so YOLO boxes line up.
                    Optional homography points must be entered in this same pixel space.
                  </p>
                  <div
                    className="relative mt-3 inline-block max-w-full overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700"
                    style={{
                      width: result.image_width,
                      maxWidth: "100%",
                    }}
                  >
                    <img
                      src={previewUrl}
                      alt="Analysis preview"
                      width={result.image_width}
                      height={result.image_height}
                      className="block h-auto max-w-full"
                      style={{ width: result.image_width, height: result.image_height }}
                    />
                    <svg
                      className="pointer-events-none absolute left-0 top-0"
                      width={result.image_width}
                      height={result.image_height}
                      viewBox={`0 0 ${result.image_width} ${result.image_height}`}
                    >
                      {result.players.map((p, i) => (
                        <rect
                          key={i}
                          x={p.x1}
                          y={p.y1}
                          width={p.x2 - p.x1}
                          height={p.y2 - p.y1}
                          fill="none"
                          stroke="rgb(34 197 94)"
                          strokeWidth={2}
                        />
                      ))}
                      {result.ball && (
                        <circle
                          cx={result.ball.x}
                          cy={result.ball.y}
                          r={8}
                          fill="rgb(239 68 68)"
                        />
                      )}
                    </svg>
                  </div>
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
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}
