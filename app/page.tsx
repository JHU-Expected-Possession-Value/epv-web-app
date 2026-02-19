import Link from "next/link";

export default function Home() {
  return (
    <section className="bg-zinc-900 px-4 py-24 sm:px-6 md:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
          JHU Expected Possession Value (EPV)
        </h1>
        <p className="mt-6 text-lg leading-8 text-zinc-400">
          Research and tools for valuing possession and actions in sports using
          expected possession value models.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/tools"
            className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-200"
          >
            Tools
          </Link>
          <Link
            href="/about"
            className="rounded-lg border border-zinc-600 bg-transparent px-6 py-3 text-sm font-semibold text-white transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            About
          </Link>
        </div>
      </div>
    </section>
  );
}
