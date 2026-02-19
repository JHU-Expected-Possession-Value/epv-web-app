import Container from "@/components/Container";

export default function TutorialPage() {
  return (
    <Container>
      <div className="py-16">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Tutorial
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          How EPV works and how to use the tools.
        </p>

        <section className="mt-12 space-y-8">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
              How EPV works
            </h2>
            <ul className="mt-4 list-disc space-y-2 pl-6 text-zinc-600 dark:text-zinc-400">
              <li>
                Expected Possession Value assigns a value to each game state
                (e.g., field position, down, time) representing the expected
                points from that possession.
              </li>
              <li>
                Actions (passes, runs, turnovers) change the state and thus the
                EPV; the difference is the value added or lost by that action.
              </li>
              <li>
                EPV models are trained on historical play-by-play data to
                estimate these expectations.
              </li>
              <li>
                Counterfactual analysis compares what actually happened to what
                would have happened under different decisions.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
              How to use the tools
            </h2>
            <ul className="mt-4 list-disc space-y-2 pl-6 text-zinc-600 dark:text-zinc-400">
              <li>
                <strong>Dashboard:</strong> Use the dashboard to explore
                aggregate EPV metrics, trends, and key plays for games or
                seasons.
              </li>
              <li>
                <strong>Replay:</strong> Use the replay tool to step through
                events and run counterfactual simulations (e.g., &quot;what if
                they had passed here?&quot;) and see the EPV impact.
              </li>
              <li>
                Ensure the API backend is running so that live data and
                simulations are available; check the API Status section on
                Dashboard or Replay.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </Container>
  );
}
