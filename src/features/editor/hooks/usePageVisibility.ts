'use client';
import { useEffect, useState, type RefObject } from 'react';

const callbacks = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | null = null;

export function usePageVisibility(ref: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    observer ??= new IntersectionObserver(
      (entries) => {
        for (const entry of entries) callbacks.get(entry.target)?.(entry.isIntersecting);
      },
      { rootMargin: '650px' },
    );
    callbacks.set(element, setVisible);
    observer.observe(element);
    return () => {
      observer?.unobserve(element);
      callbacks.delete(element);
      if (!callbacks.size) {
        observer?.disconnect();
        observer = null;
      }
    };
  }, [ref]);
  return visible;
}
