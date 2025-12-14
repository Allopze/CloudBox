import { useEffect, useMemo, useState } from 'react';
import type { SVGProps } from 'react';
import { ArrowRight, Check, Cloud, Menu, Moon, Server, ShieldCheck, Sun, X } from 'lucide-react';
import { fetchJson } from '../lib/api';
import { applyThemeMode, getSavedThemeMode, setSavedThemeMode } from '../lib/theme';
import { applyFavicon, applyTitle, resolveAssetUrl, type BrandingSettings } from '../lib/branding';
import AnchorLink from './landing/AnchorLink';
import CloudBoxMockup from './landing/CloudBoxMockup';
import FaqItem from './landing/FaqItem';
import Section from './landing/Section';
import { FALLBACK_LANDING_CONFIG } from './landing/defaultConfig';
import { getLandingIcon } from './landing/icons';
import type { LandingConfigV1 } from './landing/types';

import Testimonials from './landing/Testimonials';

function CodeLabelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 18l-6-6 6-6" />
      <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15 6l6 6-6 6" />
    </svg>
  );
}

export default function Landing() {
  const [config, setConfig] = useState<LandingConfigV1>(FALLBACK_LANDING_CONFIG);
  const [branding, setBranding] = useState<BrandingSettings>({});
  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mode = getSavedThemeMode();
    applyThemeMode(mode);
    setIsDark(document.documentElement.classList.contains('dark'));

    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (getSavedThemeMode() === 'system') {
        applyThemeMode('system');
        setIsDark(document.documentElement.classList.contains('dark'));
      }
    };
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, []);

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    setSavedThemeMode(next);
    applyThemeMode(next);
    setIsDark(next === 'dark');
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [landing, brandingSettings] = await Promise.all([
          fetchJson<LandingConfigV1>('/admin/settings/landing'),
          fetchJson<BrandingSettings>('/admin/settings/branding'),
        ]);

        if (!mounted) return;

        setConfig(landing);
        setBranding(brandingSettings);
        applyFavicon(brandingSettings.faviconUrl);
        applyTitle(brandingSettings.siteName);
      } catch {
        // Keep fallback
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const hero = config.sections.hero;

  const navItems = useMemo(
    () => [
      { id: 'beneficios', label: 'Beneficios', enabled: config.sections.benefits.enabled },
      { id: 'como-funciona', label: 'Cómo funciona', enabled: config.sections.howItWorks.enabled },
      { id: 'features', label: 'Características', enabled: config.sections.features.enabled },
      { id: 'comparativa', label: 'Comparativa', enabled: config.sections.comparison.enabled },
      { id: 'seguridad', label: 'Seguridad', enabled: config.sections.security.enabled },
      { id: 'github', label: 'GitHub', enabled: config.sections.github.enabled },
      { id: 'casos', label: 'Casos de uso', enabled: config.sections.useCases.enabled },
      { id: 'faq', label: 'FAQ', enabled: config.sections.faq.enabled },
    ],
    [config.sections]
  );

  const logoSrc = resolveAssetUrl(isDark ? branding.logoDarkUrl || branding.logoUrl : branding.logoLightUrl || branding.logoUrl);
  const heroImageUrl = resolveAssetUrl(config.assets?.heroImageUrl);
  const featureImageUrl = resolveAssetUrl(config.assets?.featureImageUrl);

  return (
    <div className="min-h-screen bg-white text-dark-900 dark:bg-dark-900 dark:text-dark-100">
      <header className="sticky top-0 z-40 border-b border-dark-200/60 dark:border-dark-800/60 bg-white/85 dark:bg-dark-900/75 backdrop-blur">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a href="#" className="flex items-center gap-2">
              {logoSrc ? (
                <img src={logoSrc} alt={branding.siteName || 'CloudBox'} className="h-8 w-auto" />
              ) : (
                <div className="font-bold tracking-tight text-xl">
                  <span className="text-dark-900 dark:text-white">Cloud</span>
                  <span className="text-primary-600">Box</span>
                </div>
              )}
            </a>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-dark-600 dark:text-dark-300">
            {navItems
              .filter((n) => n.enabled)
              .map((n) => (
                <a key={n.id} href={`#${n.id}`} className="hover:text-primary-600 dark:hover:text-white transition-colors">
                  {n.label}
                </a>
              ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-dark-100 dark:hover:bg-white/10 transition-colors"
              aria-label={isDark ? 'Modo claro' : 'Modo oscuro'}
              title={isDark ? 'Modo claro' : 'Modo oscuro'}
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            <div className="hidden sm:flex items-center gap-2">
              <AnchorLink href={hero.secondaryCta.href} className="btn btn-secondary">
                {hero.secondaryCta.label}
              </AnchorLink>
              <AnchorLink
                href={hero.primaryCta.href}
                className="btn btn-primary"
              >
                {hero.primaryCta.label}
                <ArrowRight className="h-4 w-4" />
              </AnchorLink>
            </div>

            <button
              className="md:hidden p-2 rounded-lg hover:bg-dark-100 dark:hover:bg-white/10 transition-colors"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Abrir navegación"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>

        {mobileNavOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
            <div className="absolute right-0 top-0 h-full w-full max-w-sm bg-white dark:bg-dark-900 border-l border-dark-200 dark:border-dark-800 shadow-2xl">
              <div className="h-16 px-4 flex items-center justify-between border-b border-dark-200 dark:border-dark-800">
                <div className="font-bold text-xl">
                  <span className="text-dark-900 dark:text-white">Cloud</span>
                  <span className="text-primary-600">Box</span>
                </div>
                <button
                  className="p-2 rounded-lg hover:bg-dark-100 dark:hover:bg-white/10 transition-colors"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Cerrar navegación"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 space-y-2">
                {navItems
                  .filter((n) => n.enabled)
                  .map((n) => (
                    <a
                      key={n.id}
                      href={`#${n.id}`}
                      onClick={() => setMobileNavOpen(false)}
                      className="block px-3 py-2 rounded-lg text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-white/10 font-medium"
                    >
                      {n.label}
                    </a>
                  ))}
                <div className="pt-4 flex flex-col gap-2">
                  <AnchorLink href={hero.secondaryCta.href} className="btn btn-secondary w-full justify-center">
                    {hero.secondaryCta.label}
                  </AnchorLink>
                  <AnchorLink
                    href={hero.primaryCta.href}
                    className="btn btn-primary w-full justify-center"
                  >
                    {hero.primaryCta.label}
                    <ArrowRight className="h-4 w-4" />
                  </AnchorLink>
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      {hero.enabled && (
        <section className="relative overflow-hidden pt-14 pb-16 sm:pt-32 sm:pb-24 bg-dot-pattern">
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[500px] w-[800px] bg-primary-500/20 blur-[120px] rounded-full opacity-50 dark:opacity-20" />
          </div>

          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-dark-200 dark:border-dark-700 bg-white/80 dark:bg-dark-800/80 backdrop-blur-sm px-4 py-1.5 text-sm font-medium text-dark-600 dark:text-dark-300 mb-8 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
              </span>
              Nube privada · experiencia moderna
            </div>
            
            <h1 className="text-5xl sm:text-7xl font-bold tracking-tight text-dark-900 dark:text-white text-balance mb-6">
              {hero.title}
            </h1>
            
            <p className="mx-auto max-w-2xl text-lg sm:text-xl leading-relaxed text-dark-600 dark:text-dark-300 text-balance mb-10">
              {hero.subtitle}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <AnchorLink
                href={hero.primaryCta.href}
                className="btn btn-primary h-12 px-8 text-base"
              >
                {hero.primaryCta.label}
                <ArrowRight className="h-4 w-4" />
              </AnchorLink>
              <AnchorLink href={hero.secondaryCta.href} className="btn btn-secondary h-12 px-8 text-base">
                {hero.secondaryCta.label}
              </AnchorLink>
            </div>

            <div className="relative mx-auto max-w-5xl">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary-500 to-purple-600 rounded-2xl blur opacity-20 dark:opacity-40" />
              {heroImageUrl ? (
                <div className="relative rounded-2xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 shadow-2xl overflow-hidden">
                  <img src={heroImageUrl} alt="CloudBox" className="w-full h-auto" />
                </div>
              ) : (
                <CloudBoxMockup />
              )}
              {loading && <div className="mt-3 text-xs text-dark-400">Cargando…</div>}
            </div>
            
            <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-8 items-center justify-center opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
               {/* Placeholder for logos if needed, or just keep the existing small cards but styled differently */}
            </div>
          </div>
        </section>
      )}

      {config.sections.benefits.enabled && (
        <Section id="beneficios" eyebrow="CloudBox" title={config.sections.benefits.title}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {config.sections.benefits.items.map((item) => {
              const Icon = getLandingIcon(item.icon);
              return (
                <div key={item.id} className="bento-card hover:-translate-y-1">
                  <div className="h-12 w-12 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mb-6">
                    <Icon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="font-bold text-lg text-dark-900 dark:text-white mb-2">{item.title}</div>
                  <div className="text-base leading-relaxed text-dark-600 dark:text-dark-300">{item.description}</div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {config.sections.howItWorks.enabled && (
        <Section id="como-funciona" eyebrow="CloudBox" title={config.sections.howItWorks.title}>
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="bento-card">
              <div className="flex items-center gap-2 text-lg font-semibold text-dark-900 dark:text-white">
                <Cloud className="h-6 w-6 text-primary-600" />
                {config.sections.howItWorks.cloud.title}
              </div>
              <div className="mt-8 space-y-6">
                {config.sections.howItWorks.cloud.steps.map((step, idx) => (
                  <div key={step.id} className="flex gap-5">
                    <div className="h-8 w-8 rounded-full bg-primary-600 text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-lg shadow-primary-500/30">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-bold text-dark-900 dark:text-white text-lg">{step.title}</div>
                      <div className="text-base text-dark-600 dark:text-dark-300 mt-1">{step.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bento-card">
              <div className="flex items-center gap-2 text-lg font-semibold text-dark-900 dark:text-white">
                <Server className="h-6 w-6 text-primary-600" />
                {config.sections.howItWorks.selfHosted.title}
              </div>
              <div className="mt-8 space-y-6">
                {config.sections.howItWorks.selfHosted.steps.map((step, idx) => (
                  <div key={step.id} className="flex gap-5">
                    <div className="h-8 w-8 rounded-full bg-dark-100 dark:bg-dark-700 text-dark-900 dark:text-white flex items-center justify-center text-sm font-bold border border-dark-200 dark:border-dark-600 shrink-0">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-bold text-dark-900 dark:text-white text-lg">{step.title}</div>
                      <div className="text-base text-dark-600 dark:text-dark-300 mt-1">{step.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>
      )}

      {config.sections.features.enabled && (
        <Section id="features" eyebrow="CloudBox" title={config.sections.features.title}>
          <div className="grid lg:grid-cols-3 gap-6 auto-rows-fr">
            {config.sections.features.groups.map((group, idx) => (
              <div key={group.id} className={`bento-card ${idx === 0 ? 'lg:col-span-2' : ''}`}>
                <div className="text-xl font-bold text-dark-900 dark:text-white mb-2">{group.title}</div>
                {group.description && <div className="text-base text-dark-600 dark:text-dark-300 mb-6">{group.description}</div>}
                <div className="mt-auto space-y-3">
                  {group.items.map((item) => {
                    const Icon = getLandingIcon(item.icon);
                    return (
                      <div key={item.id} className="flex gap-4 rounded-2xl border border-dark-100 dark:border-dark-700/50 bg-dark-50/50 dark:bg-dark-900/20 px-4 py-3 hover:bg-white dark:hover:bg-dark-800 transition-colors">
                        <div className="h-10 w-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center shrink-0">
                          <Icon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-dark-900 dark:text-white">{item.title}</div>
                          <div className="text-sm text-dark-600 dark:text-dark-400">{item.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {featureImageUrl && (
            <div className="mt-16 rounded-3xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 overflow-hidden shadow-2xl">
              <img src={featureImageUrl} alt="CloudBox" className="w-full h-auto" />
            </div>
          )}
        </Section>
      )}

      {config.sections.comparison.enabled && (
        <Section id="comparativa" eyebrow="CloudBox" title={config.sections.comparison.title}>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bento-card">
              <div className="flex items-center gap-2 text-sm font-semibold text-dark-900 dark:text-white">
                <Cloud className="h-5 w-5 text-primary-600" />
                {config.sections.comparison.cloud.title}
              </div>
              <div className="mt-2 text-sm text-dark-600 dark:text-dark-300">{config.sections.comparison.cloud.description}</div>
              <div className="mt-5 space-y-2">
                {config.sections.comparison.cloud.bullets.map((b) => (
                  <div key={b} className="flex items-start gap-2 text-sm text-dark-700 dark:text-dark-200">
                    <div className="mt-1 h-5 w-5 rounded-full bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                      <Check className="h-3.5 w-3.5 text-primary-600" />
                    </div>
                    <div>{b}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bento-card">
              <div className="flex items-center gap-2 text-sm font-semibold text-dark-900 dark:text-white">
                <Server className="h-5 w-5 text-primary-600" />
                {config.sections.comparison.selfHosted.title}
              </div>
              <div className="mt-2 text-sm text-dark-600 dark:text-dark-300">{config.sections.comparison.selfHosted.description}</div>
              <div className="mt-5 space-y-2">
                {config.sections.comparison.selfHosted.bullets.map((b) => (
                  <div key={b} className="flex items-start gap-2 text-sm text-dark-700 dark:text-dark-200">
                    <div className="mt-1 h-5 w-5 rounded-full bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                      <Check className="h-3.5 w-3.5 text-primary-600" />
                    </div>
                    <div>{b}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800">
            <div className="grid grid-cols-3 px-5 py-3 text-xs font-medium text-dark-500 dark:text-dark-400 bg-dark-50 dark:bg-dark-900/40">
              <div>Característica</div>
              <div>Nube</div>
              <div>Autohospedado</div>
            </div>
            <div className="divide-y divide-dark-200 dark:divide-dark-700">
              {config.sections.comparison.rows.map((row) => (
                <div key={row.id} className="grid grid-cols-3 px-5 py-4 text-sm">
                  <div className="font-medium text-dark-900 dark:text-white">{row.label}</div>
                  <div className="text-dark-700 dark:text-dark-200">{row.cloud}</div>
                  <div className="text-dark-700 dark:text-dark-200">{row.selfHosted}</div>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {config.sections.security.enabled && (
        <Section id="seguridad" eyebrow="CloudBox" title={config.sections.security.title}>
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bento-card">
              <div className="text-lg leading-relaxed text-dark-700 dark:text-dark-200">{config.sections.security.body}</div>
            </div>
            <div className="lg:col-span-5 rounded-3xl border border-white/10 bg-dark-900 p-8 shadow-2xl">
              <div className="flex items-center gap-2 text-lg font-semibold text-white">
                <ShieldCheck className="h-6 w-6 text-primary-500" />
                Puntos clave
              </div>
              <div className="mt-6 space-y-4">
                {config.sections.security.points.map((p) => (
                  <div key={p} className="flex items-start gap-3 text-base text-white/80">
                    <div className="mt-1 h-5 w-5 rounded-full bg-white/10 flex items-center justify-center">
                      <Check className="h-3.5 w-3.5 text-primary-500" />
                    </div>
                    <div>{p}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>
      )}

      {config.sections.github.enabled && (
        <Section id="github" eyebrow="CloudBox" title={config.sections.github.title}>
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 bento-card">
              <div className="text-lg leading-relaxed text-dark-700 dark:text-dark-200">{config.sections.github.body}</div>
              <div className="mt-8">
                <AnchorLink href={config.links.githubUrl} className="btn btn-secondary">
                  {config.sections.github.ctaLabel}
                  <ArrowRight className="h-4 w-4" />
                </AnchorLink>
              </div>
            </div>
            <div className="lg:col-span-5 rounded-3xl border border-dark-200 dark:border-dark-700 bg-dark-50 dark:bg-dark-800 p-8">
              <div className="text-lg font-semibold text-dark-900 dark:text-white">Requisitos mínimos</div>
              <div className="mt-6 space-y-3">
                {config.sections.github.requirements.map((r) => (
                  <div key={r} className="flex items-start gap-3 text-base text-dark-700 dark:text-dark-200">
                    <div className="mt-1 h-5 w-5 rounded-full bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                      <Check className="h-3.5 w-3.5 text-primary-600" />
                    </div>
                    <div>{r}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>
      )}

      {config.sections.useCases.enabled && (
        <Section id="casos" eyebrow="CloudBox" title={config.sections.useCases.title}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {config.sections.useCases.items.map((item) => {
              const Icon = getLandingIcon(item.icon);
              return (
                <div key={item.id} className="bento-card hover:-translate-y-1">
                  <div className="h-12 w-12 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mb-6">
                    <Icon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="font-bold text-lg text-dark-900 dark:text-white mb-2">{item.title}</div>
                  <div className="text-base text-dark-600 dark:text-dark-300">{item.description}</div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Testimonials />

      {config.sections.faq.enabled && (
        <Section id="faq" eyebrow="CloudBox" title={config.sections.faq.title}>
          <div className="space-y-3 max-w-3xl">
            {config.sections.faq.items.map((item) => (
              <FaqItem key={item.id} question={item.question} answer={item.answer} />
            ))}
          </div>
        </Section>
      )}

      {config.sections.footer.enabled && (
        <footer className="border-t border-white/10 bg-dark-900 text-white">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
            <div className="grid md:grid-cols-12 gap-12">
              <div className="md:col-span-5">
                <div className="font-bold text-2xl">
                  <span className="text-white">Cloud</span>
                  <span className="text-primary-500">Box</span>
                </div>
                <div className="mt-4 text-base text-white/70 leading-relaxed max-w-sm">{config.sections.footer.tagline}</div>
              </div>
              <div className="md:col-span-7 grid sm:grid-cols-3 gap-8">
                {config.sections.footer.groups.map((group) => (
                  <div key={group.id}>
                    <div className="text-sm font-semibold text-white uppercase tracking-wider">{group.title}</div>
                    <div className="mt-6 space-y-4">
                      {group.links.map((l) => (
                        <AnchorLink key={l.id} href={l.href} className="block text-sm text-white/60 hover:text-white transition-colors">
                          {l.label}
                        </AnchorLink>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-16 pt-8 border-t border-white/10 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between text-sm text-white/50">
              <div>{config.sections.footer.finePrint || ''}</div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                <span>Úsalo en la nube o autohospédalo.</span>
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
