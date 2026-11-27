import type { Metadata } from 'next';
import LandingPage from '@/features/landing/LandingPage';
import { LANDING } from '@/features/landing/content';

export const metadata: Metadata = {
  ...LANDING.id.meta,
  alternates: { languages: { id: '/', en: '/en/' } },
};

export default function Home() {
  return <LandingPage locale="id" />;
}
