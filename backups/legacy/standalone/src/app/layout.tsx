import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Kartesian — Editor Koordinat',
  description:
    'Editor dokumen F4 presisi. Susun teks dan gambar, pandu dengan PDF, lalu cetak atau ekspor secara lokal.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/app-icon.svg', apple: '/icons/app-icon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#2563eb' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
