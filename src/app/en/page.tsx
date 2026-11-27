import type { Metadata } from 'next';
import LandingPage from '@/features/landing/LandingPage';
import { LANDING } from '@/features/landing/content';

export const metadata: Metadata = {
  ...LANDING.en.meta,
  alternates: { languages: { id: '/', en: '/en/' } },
};

export default function EnglishHome() {
  return <LandingPage locale="en" />;
}
