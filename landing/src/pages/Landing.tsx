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
                <div className="font-semibold tracking-tight">
                  <span className="text-dark-900 dark:text-white">Cloud</span>
                  <span className="text-[#F44336]">Box</span>
                </div>
              )}
            </a>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm text-dark-600 dark:text-dark-300">
            {navItems
              .filter((n) => n.enabled)
              .map((n) => (
                <a key={n.id} href={`#${n.id}`} className="hover:text-dark-900 dark:hover:text-white transition-colors">
                  {n.label}
                </a>
              ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-dark-100 dark:hover:bg-white/10 transition-colors"
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
                className="btn bg-[#F44336] text-white hover:bg-[#e53935] active:bg-[#d32f2f] focus:ring-2 focus:ring-[#F44336]/40"
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
                <div className="font-semibold">
                  <span className="text-dark-900 dark:text-white">Cloud</span>
                  <span className="text-[#F44336]">Box</span>
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
                      className="block px-3 py-2 rounded-lg text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-white/10"
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
                    className="btn bg-[#F44336] text-white hover:bg-[#e53935] active:bg-[#d32f2f] w-full justify-center"
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
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10">
            <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[#F44336]/10 blur-3xl" />
            <div className="absolute top-40 -right-24 h-72 w-72 rounded-full bg-[#F44336]/10 blur-3xl" />
          </div>

          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-14 pb-16 sm:pt-20 sm:pb-20">
            <div className="grid lg:grid-cols-12 gap-10 items-center">
              <div className="lg:col-span-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-dark-200 dark:border-dark-700 bg-white/70 dark:bg-dark-800/60 px-3 py-1 text-xs text-dark-600 dark:text-dark-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#F44336]" />
                  Nube privada · experiencia moderna
                </div>
                <h1 className="mt-5 text-4xl sm:text-5xl font-semibold tracking-tight text-dark-900 dark:text-white">
                  {hero.title}
                </h1>
                <p className="mt-4 text-base sm:text-lg leading-relaxed text-dark-600 dark:text-dark-300">
                  {hero.subtitle}
                </p>

                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <AnchorLink
                    href={hero.primaryCta.href}
                    className="btn bg-[#F44336] text-white hover:bg-[#e53935] active:bg-[#d32f2f] focus:ring-2 focus:ring-[#F44336]/40 justify-center"
                  >
                    {hero.primaryCta.label}
                    <ArrowRight className="h-4 w-4" />
                  </AnchorLink>
                  <AnchorLink href={hero.secondaryCta.href} className="btn btn-secondary justify-center">
                    {hero.secondaryCta.label}
                  </AnchorLink>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-3 max-w-md">
                  {[
                    { icon: Cloud, label: 'En la nube', value: config.links.cloudUrl },
                    { icon: CodeLabelIcon, label: 'Autohospedado', value: 'GitHub / Autoalojado' },
                  ].map((item) => {
                    const Icon = item.icon as any;
                    return (
                      <div key={item.label} className="rounded-xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 px-4 py-3">
                        <div className="flex items-center gap-2 text-xs text-dark-500 dark:text-dark-400">
                          <Icon className="h-4 w-4 text-[#F44336]" />
                          {item.label}
                        </div>
                        <div className="mt-1 text-sm font-medium text-dark-900 dark:text-white truncate">{item.value}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-6">
                {heroImageUrl ? (
                  <div className="rounded-2xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 shadow-sm overflow-hidden">
                    <img src={heroImageUrl} alt="CloudBox" className="w-full h-auto" />
                  </div>
                ) : (
                  <CloudBoxMockup />
                )}
                {loading && <div className="mt-3 text-xs text-dark-400">Cargando…</div>}
              </div>
            </div>
          </div>
        </section>
      )}

      {config.sections.benefits.enabled && (
        <Section id="beneficios" eyebrow="CloudBox" title={config.sections.benefits.title}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {config.sections.benefits.items.map((item) => {
              const Icon = getLandingIcon(item.icon);
              return (
                <div key={item.id} className="card p-5 hover:shadow-md transition-shadow">
                  <div className="h-10 w-10 rounded-xl bg-[#F44336]/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-[#F44336]" />
                  </div>
                  <div className="mt-4 font-semibold text-dark-900 dark:text-white">{item.title}</div>
                  <div className="mt-2 text-sm leading-relaxed text-dark-600 dark:text-dark-300">{item.description}</div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {config.sections.howItWorks.enabled && (
        <Section id="como-funciona" eyebrow="CloudBox" title={config.sections.howItWorks.title}>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 p-6">
              <div className="flex items-center gap-2 text-sm font-medium text-dark-900 dark:text-white">
                <Cloud className="h-5 w-5 text-[#F44336]" />
                {config.sections.howItWorks.cloud.title}
              </div>
              <div className="mt-5 space-y-4">
                {config.sections.howItWorks.cloud.steps.map((step, idx) => (
                  <div key={step.id} className="flex gap-4">
                    <div className="h-8 w-8 rounded-full bg-[#F44336] text-white flex items-center justify-center text-sm font-semibold">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-medium text-dark-900 dark:text-white">{step.title}</div>
                      <div className="text-sm text-dark-600 dark:text-dark-300">{step.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 p-6">
              <div className="flex items-center gap-2 text-sm font-medium text-dark-900 dark:text-white">
                <Server className="h-5 w-5 text-[#F44336]" />
                {config.sections.howItWorks.selfHosted.title}
              </div>
              <div className="mt-5 space-y-4">
                {config.sections.howItWorks.selfHosted.steps.map((step, idx) => (
                  <div key={step.id} className="flex gap-4">
                    <div className="h-8 w-8 rounded-full bg-dark-100 dark:bg-dark-700 text-dark-900 dark:text-white flex items-center justify-center text-sm font-semibold border border-dark-200 dark:border-dark-600">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-medium text-dark-900 dark:text-white">{step.title}</div>
                      <div className="text-sm text-dark-600 dark:text-dark-300">{step.description}</div>
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
          <div className="grid lg:grid-cols-3 gap-4">
            {config.sections.features.groups.map((group) => (
              <div key={group.id} className="card p-6">
                <div className="text-lg font-semibold text-dark-900 dark:text-white">{group.title}</div>
                {group.description && <div className="mt-1 text-sm text-dark-600 dark:text-dark-300">{group.description}</div>}
                <div className="mt-5 space-y-3">
                  {group.items.map((item) => {
                    const Icon = getLandingIcon(item.icon);
                    return (
                      <div key={item.id} className="flex gap-3 rounded-xl border border-dark-200 dark:border-dark-700 bg-dark-50 dark:bg-dark-900/40 px-4 py-3">
                        <div className="h-9 w-9 rounded-xl bg-[#F44336]/10 flex items-center justify-center shrink-0">
                          <Icon className="h-4 w-4 text-[#F44336]" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-dark-900 dark:text-white">{item.title}</div>
                          <div className="text-sm text-dark-600 dark:text-dark-300">{item.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {featureImageUrl && (
            <div className="mt-10 rounded-2xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 overflow-hidden shadow-sm">
              <img src={featureImageUrl} alt="CloudBox" className="w-full h-auto" />
            </div>
          )}
        </Section>
      )}

      {config.sections.comparison.enabled && (
        <Section id="comparativa" eyebrow="CloudBox" title={config.sections.comparison.title}>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="card p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-dark-900 dark:text-white">
                <Cloud className="h-5 w-5 text-[#F44336]" />
                {config.sections.comparison.cloud.title}
              </div>
              <div className="mt-2 text-sm text-dark-600 dark:text-dark-300">{config.sections.comparison.cloud.description}</div>
              <div className="mt-5 space-y-2">
                {config.sections.comparison.cloud.bullets.map((b) => (
                  <div key={b} className="flex items-start gap-2 text-sm text-dark-700 dark:text-dark-200">
                    <div className="mt-1 h-5 w-5 rounded-full bg-[#F44336]/10 flex items-center justify-center">
                      <Check className="h-3.5 w-3.5 text-[#F44336]" />
                    </div>
                    <div>{b}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-dark-900 dark:text-white">
                <Server className="h-5 w-5 text-[#F44336]" />
                {config.sections.comparison.selfHosted.title}
              </div>
              <div className="mt-2 text-sm text-dark-600 dark:text-dark-300">{config.sections.comparison.selfHosted.description}</div>
              <div className="mt-5 space-y-2">
                {config.sections.comparison.selfHosted.bullets.map((b) => (
                  <div key={b} className="flex items-start gap-2 text-sm text-dark-700 dark:text-dark-200">
                    <div className="mt-1 h-5 w-5 rounded-full bg-[#F44336]/10 flex items-center justify-center">
                      <Check className="h-3.5 w-3.5 text-[#F44336]" />
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
            <div className="lg:col-span-7 card p-6">
              <div className="text-sm leading-relaxed text-dark-700 dark:text-dark-200">{config.sections.security.body}</div>
            </div>
            <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-dark-900 p-6 shadow-lg">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck className="h-5 w-5 text-[#F44336]" />
                Puntos clave
              </div>
              <div className="mt-5 space-y-3">
                {config.sections.security.points.map((p) => (
                  <div key={p} className="flex items-start gap-3 text-sm text-white/80">
                    <div className="mt-1 h-5 w-5 rounded-full bg-white/10 flex items-center justify-center">
                      <Check className="h-3.5 w-3.5 text-[#F44336]" />
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
            <div className="lg:col-span-7 card p-6">
              <div className="text-sm leading-relaxed text-dark-700 dark:text-dark-200">{config.sections.github.body}</div>
              <div className="mt-6">
                <AnchorLink href={config.links.githubUrl} className="btn btn-secondary">
                  {config.sections.github.ctaLabel}
                  <ArrowRight className="h-4 w-4" />
                </AnchorLink>
              </div>
            </div>
            <div className="lg:col-span-5 rounded-2xl border border-dark-200 dark:border-dark-700 bg-dark-50 dark:bg-dark-800 p-6">
              <div className="text-sm font-semibold text-dark-900 dark:text-white">Requisitos mínimos</div>
              <div className="mt-4 space-y-2">
                {config.sections.github.requirements.map((r) => (
                  <div key={r} className="flex items-start gap-2 text-sm text-dark-700 dark:text-dark-200">
                    <div className="mt-1 h-5 w-5 rounded-full bg-[#F44336]/10 flex items-center justify-center">
                      <Check className="h-3.5 w-3.5 text-[#F44336]" />
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {config.sections.useCases.items.map((item) => {
              const Icon = getLandingIcon(item.icon);
              return (
                <div key={item.id} className="card p-5">
                  <div className="h-10 w-10 rounded-xl bg-[#F44336]/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-[#F44336]" />
                  </div>
                  <div className="mt-4 font-semibold text-dark-900 dark:text-white">{item.title}</div>
                  <div className="mt-2 text-sm text-dark-600 dark:text-dark-300">{item.description}</div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

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
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-14">
            <div className="grid md:grid-cols-12 gap-10">
              <div className="md:col-span-5">
                <div className="font-semibold text-lg">
                  <span className="text-white">Cloud</span>
                  <span className="text-[#F44336]">Box</span>
                </div>
                <div className="mt-3 text-sm text-white/70 leading-relaxed">{config.sections.footer.tagline}</div>
              </div>
              <div className="md:col-span-7 grid sm:grid-cols-3 gap-8">
                {config.sections.footer.groups.map((group) => (
                  <div key={group.id}>
                    <div className="text-sm font-semibold text-white">{group.title}</div>
                    <div className="mt-4 space-y-2">
                      {group.links.map((l) => (
                        <AnchorLink key={l.id} href={l.href} className="block text-sm text-white/70 hover:text-white transition-colors">
                          {l.label}
                        </AnchorLink>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between text-sm text-white/60">
              <div>{config.sections.footer.finePrint || ''}</div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F44336]" />
                <span>Úsalo en la nube o autohospédalo.</span>
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
