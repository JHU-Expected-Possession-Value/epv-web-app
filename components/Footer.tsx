import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 text-zinc-500">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm">
            JHU Expected Possession Value (EPV) — Sports analytics research.
          </p>
          <div className="flex gap-6 text-sm">
            <Link href="/tools" className="hover:text-white">
              Tools
            </Link>
            <Link href="/tutorial" className="hover:text-white">
              Tutorial
            </Link>
            <Link href="/about" className="hover:text-white">
              About
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
