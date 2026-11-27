import {
  ArrowRight,
  Crosshair,
  FileUp,
  Files,
  HardDrive,
  Lock,
  MousePointer2,
  Printer,
  Ruler,
  ScanLine,
  SlidersHorizontal,
  WifiOff,
} from 'lucide-react';
import StandaloneRedirect from './StandaloneRedirect';
import HtmlLang from './HtmlLang';
import { LANDING } from './content';
import type { Locale } from '@/i18n/core';
import '@/styles/landing.css';

const REPOSITORY = 'https://github.com/ChernobylCat/Kartesian';
/** The editor opens in the language of the landing page it was reached from. */
const editorHref = (locale: Locale) => `/editor/?lang=${locale}`;
const STEP_ICONS = [FileUp, ScanLine, Printer];
const FEATURE_ICONS = [Ruler, MousePointer2, Files, ScanLine, SlidersHorizontal, WifiOff];
const PRIVACY_ICONS = [HardDrive, Lock, ScanLine];

/** Ruler ticks every 10 mm across 210 mm, the width of A4 and F4. */
const RULER_LABELS = Array.from({ length: 22 }, (_, index) => index * 10);

function Logo() {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className="lp-logo-mark">
      <rect width="512" height="512" rx="96" fill="currentColor" />
      <path d="M112 112h288v288H112z" fill="#fff" opacity=".16" />
      <path d="M112 184h288M184 112v288" stroke="#fff" strokeWidth="24" />
      <circle cx="304" cy="280" r="52" fill="#fff" />
      <path d="m340 316 68 68" stroke="#fff" strokeWidth="28" strokeLinecap="round" />
    </svg>
  );
}

export default function LandingPage({ locale }: { locale: Locale }) {
  const copy = LANDING[locale];
  const editor = editorHref(locale);
  return (
    <div className="landing" lang={locale}>
      <HtmlLang locale={locale} />
      <StandaloneRedirect />
      <a className="lp-skip" href="#main">
        {copy.skip}
      </a>
      <header className="lp-nav">
        {/* Plain links: the static export has no RSC payload path for client-side
            navigation to /en/, so every landing link is a full page load. */}
        <a className="lp-brand" href={locale === 'id' ? '/' : '/en/'} aria-label={copy.home}>
          <Logo />
          <span>Kartesian</span>
        </a>
        <nav aria-label={copy.nav.label}>
          <a href="#how-it-works">{copy.nav.steps}</a>
          <a href="#features">{copy.nav.features}</a>
          <a href="#privacy">{copy.nav.privacy}</a>
        </nav>
        <a
          className="lp-language"
          href={copy.switchLanguage.href}
          hrefLang={copy.switchLanguage.lang}
          lang={copy.switchLanguage.lang}
        >
          {copy.switchLanguage.label}
        </a>
        <a className="lp-button lp-button--small" href={editor}>
          {copy.openEditor}
        </a>
      </header>

      <main id="main">
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">
              <Crosshair size={14} aria-hidden="true" />
              {copy.hero.eyebrow}
            </p>
            <h1 id="hero-title">{copy.hero.title}</h1>
            <p className="lp-lede">{copy.hero.lede}</p>
            <div className="lp-actions">
              <a className="lp-button" href={editor}>
                {copy.openEditor}
                <ArrowRight size={16} aria-hidden="true" />
              </a>
              <a className="lp-button lp-button--ghost" href="#how-it-works">
                {copy.hero.secondary}
              </a>
            </div>
            <p className="lp-meta">{copy.hero.meta}</p>
          </div>

          <figure className="lp-shot">
            <div className="lp-window">
              <div className="lp-window-bar" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <picture>
                <source
                  srcSet="/assets/landing/editor-dark.jpg"
                  media="(prefers-color-scheme: dark)"
                />
                <img
                  src="/assets/landing/editor-light.jpg"
                  width={1440}
                  height={1120}
                  alt={copy.hero.alt}
                  fetchPriority="high"
                />
              </picture>
            </div>
            <span className="lp-tag lp-tag--a" aria-hidden="true">
              {copy.hero.tag}
            </span>
            <span className="lp-tag lp-tag--b" aria-hidden="true">
              {'{{instansi}}'}
            </span>
            <figcaption className="lp-visually-hidden">{copy.hero.caption}</figcaption>
          </figure>
        </section>

        <div className="lp-ruler" aria-hidden="true">
          <div className="lp-ruler-scale">
            {RULER_LABELS.map((mm) => (
              <span key={mm} style={{ left: `${(mm / 210) * 100}%` }}>
                {mm}
              </span>
            ))}
          </div>
        </div>

        <section className="lp-section" id="how-it-works" aria-labelledby="steps-title">
          <div className="lp-section-head">
            <p className="lp-kicker">{copy.steps.kicker}</p>
            <h2 id="steps-title">{copy.steps.title}</h2>
          </div>
          <ol className="lp-steps">
            {copy.steps.items.map(({ title, body }, index) => {
              const Icon = STEP_ICONS[index]!;
              return (
                <li key={title}>
                  <span className="lp-step-number">{String(index + 1).padStart(2, '0')}</span>
                  <Icon size={20} aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="lp-section" id="features" aria-labelledby="features-title">
          <div className="lp-section-head">
            <p className="lp-kicker">{copy.features.kicker}</p>
            <h2 id="features-title">{copy.features.title}</h2>
          </div>
          <ul className="lp-features">
            {copy.features.items.map(({ title, body }, index) => {
              const Icon = FEATURE_ICONS[index]!;
              return (
                <li key={title}>
                  <span className="lp-feature-icon">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              );
            })}
          </ul>
          <dl className="lp-specs">
            {copy.features.specs.map(({ value, unit, label }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {value}
                  <small>{unit}</small>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="lp-privacy" id="privacy" aria-labelledby="privacy-title">
          <div className="lp-privacy-inner">
            <div>
              <p className="lp-kicker">{copy.privacy.kicker}</p>
              <h2 id="privacy-title">{copy.privacy.title}</h2>
              <p>{copy.privacy.body}</p>
            </div>
            <ul>
              {copy.privacy.points.map(({ title, body }, index) => {
                const Icon = PRIVACY_ICONS[index]!;
                return (
                  <li key={title}>
                    <Icon size={18} aria-hidden="true" />
                    <span>
                      <b>{title}</b> {body}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="lp-cta" aria-labelledby="cta-title">
          <h2 id="cta-title">{copy.cta.title}</h2>
          <p>{copy.cta.body}</p>
          <a className="lp-button" href={editor}>
            {copy.openEditor}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </section>
      </main>

      <footer className="lp-footer">
        <span className="lp-brand lp-brand--quiet">
          <Logo />
          Kartesian
        </span>
        <span>{copy.footer.license}</span>
        <nav aria-label={copy.footer.label}>
          <a href={editor}>{copy.footer.editor}</a>
          <a href={REPOSITORY} rel="noopener noreferrer">
            {copy.footer.source}
          </a>
        </nav>
      </footer>
    </div>
  );
}
