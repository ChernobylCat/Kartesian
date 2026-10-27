import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="loading-screen">
      <h1>Halaman tidak ditemukan</h1>
      <Link href="/">Buka Kartesian</Link>
    </main>
  );
}
