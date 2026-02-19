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
          Explore EPV dashboards and replay simulations.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <Link
            href="/dashboard"
            className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-8 shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
          >
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
              Dashboard
            </h2>
            <p className="mt-2 flex-1 text-sm text-zinc-600 dark:text-zinc-400">
              View EPV metrics and analytics in an interactive dashboard.
            </p>
            <span className="mt-4 text-sm font-medium text-zinc-700 group-hover:underline dark:text-zinc-300">
              Open Dashboard →
            </span>
          </Link>
          <Link
            href="/replay"
            className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-8 shadow-sm transition hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
          >
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
              Replay
            </h2>
            <p className="mt-2 flex-1 text-sm text-zinc-600 dark:text-zinc-400">
              Replay events and run counterfactual simulations with EPV.
            </p>
            <span className="mt-4 text-sm font-medium text-zinc-700 group-hover:underline dark:text-zinc-300">
              Open Replay →
            </span>
          </Link>
        </div>
      </div>
    </Container>
  );
}
