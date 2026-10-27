'use client';
export default function EditorError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="loading-screen">
      <h1>Editor mengalami kendala</h1>
      <p>Data tersimpan tetap berada di perangkat Anda.</p>
      <button onClick={reset}>Coba lagi</button>
    </main>
  );
}
