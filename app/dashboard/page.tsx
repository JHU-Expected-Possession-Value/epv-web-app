/**
 * Landing dashboard page.
 *
 * Purpose (this phase):
 * - Provide a lightweight UI entrypoint and a basic API connectivity check.
 * - This page does not talk to AWS RDS directly; it calls the FastAPI backend, which is the
 *   only component that holds DB credentials and queries Postgres at request time.
 */

import Container from "@/components/Container";
import { apiGet } from "@/lib/api";

type HealthResponse = { status?: string; [key: string]: unknown };

async function ApiStatus() {
  let data: HealthResponse | null = null;
  let error: string | null = null;
  try {
    data = await apiGet<HealthResponse>("/health");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <section className="mt-12 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
        API Status
      </h2>
      {error ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          Error: {error}
        </p>
      ) : data ? (
        <pre className="mt-2 overflow-auto rounded bg-zinc-100 p-3 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}

export default function DashboardPage() {
  return (
    <Container>
      <div className="py-16">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Dashboard
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          EPV metrics and analytics. Full dashboard coming soon.
        </p>
        <ApiStatus />
      </div>
    </Container>
  );
}
