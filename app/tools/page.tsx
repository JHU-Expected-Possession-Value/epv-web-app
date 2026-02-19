import Link from "next/link";
import Container from "@/components/Container";

export default function ToolsPage() {
  return (
    <Container>
      <div className="py-16">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Tools
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Explore EPV-powered analytics and AI decision tools.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 max-w-4xl mx-auto">
          <Link
            href="/tools/dashboard"
            className="group flex flex-col rounded-2xl border border-zinc-300 bg-white p-8 shadow-sm transition-all hover:border-zinc-400 hover:shadow-lg hover:-translate-y-1 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
          >
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
              Interactive EPV Dashboard
            </h2>
            <ul className="mt-4 flex-1 space-y-2 list-disc list-inside pl-5 text-sm text-zinc-600 dark:text-zinc-400">
              <li>Drag players and see EPV deltas</li>
              <li>Replay moments (turnovers, missed shots)</li>
              <li>Counterfactual simulations (&quot;what if pass to X instead?&quot;)</li>
            </ul>
            <span className="mt-6 text-sm font-medium text-zinc-700 group-hover:underline dark:text-zinc-300">
              Open Dashboard →
            </span>
          </Link>
          <Link
            href="/tools/clip-analyzer"
            className="group flex flex-col rounded-2xl border border-zinc-300 bg-white p-8 shadow-sm transition-all hover:border-zinc-400 hover:shadow-lg hover:-translate-y-1 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
          >
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
              Computer Vision Clip Analyzer
            </h2>
            <ul className="mt-4 flex-1 space-y-2 list-disc list-inside pl-5 text-sm text-zinc-600 dark:text-zinc-400">
              <li>Upload match clip</li>
              <li>AI decision assessment</li>
              <li>Tactical explanation + notes</li>
            </ul>
            <span className="mt-6 text-sm font-medium text-zinc-700 group-hover:underline dark:text-zinc-300">
              Open Clip Analyzer →
            </span>
          </Link>
        </div>
      </div>
    </Container>
  );
}
