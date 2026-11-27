import type { Metadata } from 'next';
import EditorClient from '@/features/editor/EditorClient';

export const metadata: Metadata = { title: 'Editor — Kartesian' };

export default function EditorPage() {
  return <EditorClient />;
}
