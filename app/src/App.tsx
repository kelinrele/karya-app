/**
 * Placeholder shell.
 *
 * Screens are ported one at a time, starting with the splash screen. Until
 * then the existing build at the repository root remains the working app and
 * this page only confirms the toolchain is wired up correctly.
 */
export default function App() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 bg-white px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-brand">Karya</h1>
      <p className="text-sm text-gray-500">A smarter way to do your day.</p>
      <p className="mt-4 max-w-sm text-xs text-gray-400">
        Rebuild in progress. Screens are being ported from the existing build one at a time.
      </p>
    </main>
  );
}
