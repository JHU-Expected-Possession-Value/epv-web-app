import Container from "@/components/Container";

export default function AboutPage() {
  return (
    <Container>
      <div className="py-16">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          About
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Team and project overview.
        </p>
        <div className="mt-12 max-w-2xl space-y-6 text-zinc-600 dark:text-zinc-400">
          <p>
            The JHU Expected Possession Value (EPV) project is a sports
            analytics initiative focused on quantifying the value of possession
            and individual actions in football (and related sports) using
            expected points and similar frameworks.
          </p>
          <p>
            Our team develops models, APIs, and tools—including the Dashboard
            and Replay counterfactual simulator—to support research and
            practical analysis. This site provides access to those tools and
            documentation.
          </p>
        </div>
      </div>
    </Container>
  );
}
