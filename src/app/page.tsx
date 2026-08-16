export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-slate-900">
      <section className="w-full max-w-2xl">
        <p className="mb-4 text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
          Portfolio
        </p>

        <h1 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
          A self-hosted portfolio workspace.
        </h1>

        <p className="mt-6 max-w-lg text-base leading-7 text-slate-600 sm:text-lg">
          This website is currently being developed.
        </p>
      </section>
    </main>
  );
}