"use client";

import { useState, useRef } from "react";
import Container from "@/components/Container";

export default function ClipAnalyzerPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      setFileName(file.name);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith("video/") || file.name.match(/\.(mp4|mov)$/i))) {
      setFileName(file.name);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <Container>
      <div className="py-16">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Computer Vision Clip Analyzer
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Upload match clips and receive AI-powered tactical insights.
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
                {fileName || "Drag & drop a video clip here"}
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
                accept=".mp4,.mov"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
              Analysis Results
            </h2>
            <div className="mt-6 space-y-6">
              <section>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                  Best Decision
                </h3>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  AI assessment will appear here after clip analysis.
                </p>
              </section>
              <section>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                  Explanation
                </h3>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Detailed tactical explanation will be provided here.
                </p>
              </section>
              <section>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                  Tactical Notes
                </h3>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Additional notes and insights will be displayed here.
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}
