import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Eye, RotateCcw, Save } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { cn } from '../../lib/utils';
import { useBrandingStore } from '../../stores/brandingStore';
import type { LandingConfigV1 } from '../public/landing/types';
import { FALLBACK_LANDING_CONFIG } from '../public/landing/defaultConfig';
import CardListEditor from './landing/CardListEditor';
import StepListEditor from './landing/StepListEditor';
import FeatureGroupsEditor from './landing/FeatureGroupsEditor';
import ComparisonEditor from './landing/ComparisonEditor';
import StringListEditor from './landing/StringListEditor';
import FooterEditor from './landing/FooterEditor';
import FaqEditor from './landing/FaqEditor';
import AssetUploader from './landing/AssetUploader';

type LandingSectionKey =
  | 'general'
  | 'hero'
  | 'benefits'
  | 'howItWorks'
  | 'features'
  | 'comparison'
  | 'security'
  | 'github'
  | 'useCases'
  | 'faq'
  | 'footer'
  | 'assets';

export default function AdminLanding() {
  const { t } = useTranslation();
  const { loadBranding, branding } = useBrandingStore();
  const [active, setActive] = useState<LandingSectionKey>('general');
  const [config, setConfig] = useState<LandingConfigV1>(FALLBACK_LANDING_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/settings/landing');
      setConfig(res.data as LandingConfigV1);
    } catch (error) {
      console.error('Failed to load landing settings', error);
      toast(t('admin.loadError'), 'error');
      setConfig(FALLBACK_LANDING_CONFIG);
    } finally {
      setLoading(false);
      setDirty(false);
    }
  }, [t]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await api.put('/admin/settings/landing', config);
      toast(t('admin.configSaved'), 'success');
      setDirty(false);
    } catch (error: any) {
      console.error('Failed to save landing settings', error);
      const msg = error?.response?.data?.error || t('admin.saveError');
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = () => {
    setConfig(FALLBACK_LANDING_CONFIG);
    setDirty(true);
    toast('Restablecido a valores por defecto (no guardado aún)', 'success');
  };

  const nav = useMemo(
    () =>
      [
        { key: 'general', label: 'General' },
        { key: 'hero', label: 'Hero' },
        { key: 'benefits', label: 'Beneficios' },
        { key: 'howItWorks', label: 'Cómo funciona' },
        { key: 'features', label: 'Características' },
        { key: 'comparison', label: 'Comparativa' },
        { key: 'security', label: 'Seguridad' },
        { key: 'github', label: 'GitHub' },
        { key: 'useCases', label: 'Casos de uso' },
        { key: 'faq', label: 'FAQ' },
        { key: 'footer', label: 'Footer' },
        { key: 'assets', label: 'Assets & branding' },
      ] as Array<{ key: LandingSectionKey; label: string }>,
    []
  );

  const setSectionEnabled = (section: keyof LandingConfigV1['sections'], enabled: boolean) => {
    setConfig((prev) => ({
      ...prev,
      sections: {
        ...prev.sections,
        [section]: { ...(prev.sections as any)[section], enabled },
      } as any,
    }));
    setDirty(true);
  };

  const uploadLandingAsset = async (type: 'hero' | 'feature', file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post(`/admin/landing/assets/${type}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const path = `${res.data.path}?t=${Date.now()}`;
    setConfig((prev) => ({
      ...prev,
      assets: {
        ...(prev.assets || {}),
        ...(type === 'hero' ? { heroImageUrl: path } : { featureImageUrl: path }),
      },
    }));
    setDirty(true);
    toast('Imagen subida', 'success');
  };

  const deleteLandingAsset = async (type: 'hero' | 'feature') => {
    await api.delete(`/admin/landing/assets/${type}`);
    setConfig((prev) => ({
      ...prev,
      assets: {
        ...(prev.assets || {}),
        ...(type === 'hero' ? { heroImageUrl: '' } : { featureImageUrl: '' }),
      },
    }));
    setDirty(true);
    toast('Imagen eliminada', 'success');
  };

  const uploadBrandingAsset = async (type: 'logo-light' | 'logo-dark' | 'favicon', file: File) => {
    const form = new FormData();
    form.append('file', file);
    await api.post(`/admin/branding/${type}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    await loadBranding();
    toast('Branding actualizado', 'success');
  };

  const pageTitle = 'Landing de CloudBox';
  const pageDescription = 'Edita textos, secciones, enlaces, iconos e imágenes sin tocar código.';

  const renderPanel = () => {
    if (active === 'general') {
      return (
        <div className="card p-6 space-y-6">
          <div>
            <div className="text-lg font-semibold text-dark-900 dark:text-white">Links principales</div>
            <div className="mt-1 text-sm text-dark-600 dark:text-dark-300">Estos enlaces se usan en CTAs, secciones y footer.</div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Input
              label="URL nube (cloudbox.lat)"
              value={config.links.cloudUrl}
              onChange={(e) => {
                setConfig((prev) => ({ ...prev, links: { ...prev.links, cloudUrl: e.target.value } }));
                setDirty(true);
              }}
            />
            <Input
              label="URL app/login"
              value={config.links.appUrl}
              onChange={(e) => {
                setConfig((prev) => ({ ...prev, links: { ...prev.links, appUrl: e.target.value } }));
                setDirty(true);
              }}
            />
            <Input
              label="URL GitHub"
              value={config.links.githubUrl}
              onChange={(e) => {
                setConfig((prev) => ({ ...prev, links: { ...prev.links, githubUrl: e.target.value } }));
                setDirty(true);
              }}
            />
            <Input
              label="URL docs (opcional)"
              value={config.links.docsUrl || ''}
              onChange={(e) => {
                setConfig((prev) => ({ ...prev, links: { ...prev.links, docsUrl: e.target.value } }));
                setDirty(true);
              }}
            />
            <Input
              label="URL soporte (opcional)"
              value={config.links.supportUrl || ''}
              onChange={(e) => {
                setConfig((prev) => ({ ...prev, links: { ...prev.links, supportUrl: e.target.value } }));
                setDirty(true);
              }}
            />
          </div>
        </div>
      );
    }

    if (active === 'hero') {
      return (
        <div className="card p-6 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-dark-900 dark:text-white">Hero</div>
              <div className="text-sm text-dark-600 dark:text-dark-300">Título, subtítulo y CTAs.</div>
            </div>
            <label className="flex items-center gap-2 text-sm text-dark-700 dark:text-dark-300">
              <input
                type="checkbox"
                checked={config.sections.hero.enabled}
                onChange={(e) => setSectionEnabled('hero', e.target.checked)}
              />
              Activo
            </label>
          </div>

          <Input
            label="Título"
            value={config.sections.hero.title}
            onChange={(e) => {
              setConfig((prev) => ({
                ...prev,
                sections: { ...prev.sections, hero: { ...prev.sections.hero, title: e.target.value } },
              }));
              setDirty(true);
            }}
          />
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">Subtítulo</label>
            <textarea
              className="input w-full h-32 resize-none"
              value={config.sections.hero.subtitle}
              onChange={(e) => {
                setConfig((prev) => ({
                  ...prev,
                  sections: { ...prev.sections, hero: { ...prev.sections.hero, subtitle: e.target.value } },
                }));
                setDirty(true);
              }}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Input
              label="CTA principal (texto)"
              value={config.sections.hero.primaryCta.label}
              onChange={(e) => {
                setConfig((prev) => ({
                  ...prev,
                  sections: {
                    ...prev.sections,
                    hero: { ...prev.sections.hero, primaryCta: { ...prev.sections.hero.primaryCta, label: e.target.value } },
                  },
                }));
                setDirty(true);
              }}
            />
            <Input
              label="CTA principal (link)"
              value={config.sections.hero.primaryCta.href}
              onChange={(e) => {
                setConfig((prev) => ({
                  ...prev,
                  sections: {
                    ...prev.sections,
                    hero: { ...prev.sections.hero, primaryCta: { ...prev.sections.hero.primaryCta, href: e.target.value } },
                  },
                }));
                setDirty(true);
              }}
            />
            <Input
              label="CTA secundario (texto)"
              value={config.sections.hero.secondaryCta.label}
              onChange={(e) => {
                setConfig((prev) => ({
                  ...prev,
                  sections: {
                    ...prev.sections,
                    hero: { ...prev.sections.hero, secondaryCta: { ...prev.sections.hero.secondaryCta, label: e.target.value } },
                  },
                }));
                setDirty(true);
              }}
            />
            <Input
              label="CTA secundario (link)"
              value={config.sections.hero.secondaryCta.href}
              onChange={(e) => {
                setConfig((prev) => ({
                  ...prev,
                  sections: {
                    ...prev.sections,
                    hero: { ...prev.sections.hero, secondaryCta: { ...prev.sections.hero.secondaryCta, href: e.target.value } },
                  },
                }));
                setDirty(true);
              }}
            />
          </div>
        </div>
      );
    }

    if (active === 'benefits') {
      return (
        <div className="card p-6 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-dark-900 dark:text-white">Beneficios</div>
            <label className="flex items-center gap-2 text-sm text-dark-700 dark:text-dark-300">
              <input
                type="checkbox"
                checked={config.sections.benefits.enabled}
                onChange={(e) => setSectionEnabled('benefits', e.target.checked)}
              />
              Activo
            </label>
          </div>

          <Input
            label="Título de sección"
            value={config.sections.benefits.title}
            onChange={(e) => {
              setConfig((prev) => ({
                ...prev,
                sections: { ...prev.sections, benefits: { ...prev.sections.benefits, title: e.target.value } },
              }));
              setDirty(true);
            }}
          />

          <CardListEditor
            title="Tarjetas"
            items={config.sections.benefits.items}
            onChange={(items) => {
              setConfig((prev) => ({
                ...prev,
                sections: { ...prev.sections, benefits: { ...prev.sections.benefits, items } },
              }));
              setDirty(true);
            }}
          />
        </div>
      );
    }

    if (active === 'howItWorks') {
      return (
        <div className="card p-6 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-dark-900 dark:text-white">Cómo funciona</div>
            <label className="flex items-center gap-2 text-sm text-dark-700 dark:text-dark-300">
              <input
                type="checkbox"
                checked={config.sections.howItWorks.enabled}
                onChange={(e) => setSectionEnabled('howItWorks', e.target.checked)}
              />
              Activo
            </label>
          </div>

          <Input
            label="Título de sección"
            value={config.sections.howItWorks.title}
            onChange={(e) => {
              setConfig((prev) => ({
                ...prev,
                sections: { ...prev.sections, howItWorks: { ...prev.sections.howItWorks, title: e.target.value } },
              }));
              setDirty(true);
            }}
          />

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-dark-200 dark:border-dark-700 p-5">
              <Input
                label="Título (Nube)"
                value={config.sections.howItWorks.cloud.title}
                onChange={(e) => {
                  setConfig((prev) => ({
                    ...prev,
                    sections: {
                      ...prev.sections,
                      howItWorks: { ...prev.sections.howItWorks, cloud: { ...prev.sections.howItWorks.cloud, title: e.target.value } },
                    },
                  }));
                  setDirty(true);
                }}
              />
              <div className="mt-4">
                <StepListEditor
                  title="Pasos (Nube)"
                  steps={config.sections.howItWorks.cloud.steps}
                  onChange={(steps) => {
                    setConfig((prev) => ({
                      ...prev,
                      sections: {
                        ...prev.sections,
                        howItWorks: { ...prev.sections.howItWorks, cloud: { ...prev.sections.howItWorks.cloud, steps } },
                      },
                    }));
                    setDirty(true);
                  }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-dark-200 dark:border-dark-700 p-5">
              <Input
                label="Título (Autohospedado)"
                value={config.sections.howItWorks.selfHosted.title}
                onChange={(e) => {
                  setConfig((prev) => ({
                    ...prev,
                    sections: {
                      ...prev.sections,
                      howItWorks: { ...prev.sections.howItWorks, selfHosted: { ...prev.sections.howItWorks.selfHosted, title: e.target.value } },
                    },
                  }));
                  setDirty(true);
                }}
              />
              <div className="mt-4">
                <StepListEditor
                  title="Pasos (Autohospedado)"
                  steps={config.sections.howItWorks.selfHosted.steps}
                  onChange={(steps) => {
                    setConfig((prev) => ({
                      ...prev,
                      sections: {
                        ...prev.sections,
                        howItWorks: { ...prev.sections.howItWorks, selfHosted: { ...prev.sections.howItWorks.selfHosted, steps } },
                      },
                    }));
                    setDirty(true);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (active === 'features') {
      return (
        <div className="card p-6 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-dark-900 dark:text-white">Características</div>
            <label className="flex items-center gap-2 text-sm text-dark-700 dark:text-dark-300">
              <input
                type="checkbox"
                checked={config.sections.features.enabled}
                onChange={(e) => setSectionEnabled('features', e.target.checked)}
              />
              Activo
            </label>
          </div>

          <Input
            label="Título de sección"
            value={config.sections.features.title}
            onChange={(e) => {
              setConfig((prev) => ({
                ...prev,
                sections: { ...prev.sections, features: { ...prev.sections.features, title: e.target.value } },
              }));
              setDirty(true);
            }}
          />

          <FeatureGroupsEditor
            groups={config.sections.features.groups}
            onChange={(groups) => {
              setConfig((prev) => ({
                ...prev,
                sections: { ...prev.sections, features: { ...prev.sections.features, groups } },
              }));
              setDirty(true);
            }}
          />
        </div>
      );
    }

    if (active === 'comparison') {
      return (
        <div className="card p-6 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-dark-900 dark:text-white">Comparativa</div>
            <label className="flex items-center gap-2 text-sm text-dark-700 dark:text-dark-300">
              <input
                type="checkbox"
                checked={config.sections.comparison.enabled}
                onChange={(e) => setSectionEnabled('comparison', e.target.checked)}
              />
              Activo
            </label>
          </div>

          <Input
            label="Título de sección"
            value={config.sections.comparison.title}
            onChange={(e) => {
              setConfig((prev) => ({
                ...prev,
                sections: { ...prev.sections, comparison: { ...prev.sections.comparison, title: e.target.value } },
              }));
              setDirty(true);
            }}
          />

          <ComparisonEditor
            comparison={config.sections.comparison}
            onChange={(next) => {
              setConfig((prev) => ({ ...prev, sections: { ...prev.sections, comparison: next } }));
              setDirty(true);
            }}
          />
        </div>
      );
    }

    if (active === 'security') {
      return (
        <div className="card p-6 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-dark-900 dark:text-white">Seguridad y privacidad</div>
            <label className="flex items-center gap-2 text-sm text-dark-700 dark:text-dark-300">
              <input
                type="checkbox"
                checked={config.sections.security.enabled}
                onChange={(e) => setSectionEnabled('security', e.target.checked)}
              />
              Activo
            </label>
          </div>

          <Input
            label="Título de sección"
            value={config.sections.security.title}
            onChange={(e) => {
              setConfig((prev) => ({
                ...prev,
                sections: { ...prev.sections, security: { ...prev.sections.security, title: e.target.value } },
              }));
              setDirty(true);
            }}
          />

          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">Texto</label>
            <textarea
              className="input w-full h-40 resize-none"
              value={config.sections.security.body}
              onChange={(e) => {
                setConfig((prev) => ({
                  ...prev,
                  sections: { ...prev.sections, security: { ...prev.sections.security, body: e.target.value } },
                }));
                setDirty(true);
              }}
            />
          </div>

          <StringListEditor
            label="Puntos destacados"
            items={config.sections.security.points}
            onChange={(points) => {
              setConfig((prev) => ({
                ...prev,
                sections: { ...prev.sections, security: { ...prev.sections.security, points } },
              }));
              setDirty(true);
            }}
            placeholder="Ej: HTTPS: cifrado en tránsito"
          />
        </div>
      );
    }

    if (active === 'github') {
      return (
        <div className="card p-6 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-dark-900 dark:text-white">Sección GitHub</div>
            <label className="flex items-center gap-2 text-sm text-dark-700 dark:text-dark-300">
              <input
                type="checkbox"
                checked={config.sections.github.enabled}
                onChange={(e) => setSectionEnabled('github', e.target.checked)}
              />
              Activo
            </label>
          </div>

          <Input
            label="Título de sección"
            value={config.sections.github.title}
            onChange={(e) => {
              setConfig((prev) => ({
                ...prev,
                sections: { ...prev.sections, github: { ...prev.sections.github, title: e.target.value } },
              }));
              setDirty(true);
            }}
          />

          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">Texto</label>
            <textarea
              className="input w-full h-32 resize-none"
              value={config.sections.github.body}
              onChange={(e) => {
                setConfig((prev) => ({
                  ...prev,
                  sections: { ...prev.sections, github: { ...prev.sections.github, body: e.target.value } },
                }));
                setDirty(true);
              }}
            />
          </div>

          <Input
            label="Texto del botón"
            value={config.sections.github.ctaLabel}
            onChange={(e) => {
              setConfig((prev) => ({
                ...prev,
                sections: { ...prev.sections, github: { ...prev.sections.github, ctaLabel: e.target.value } },
              }));
              setDirty(true);
            }}
          />

          <StringListEditor
            label="Requisitos mínimos"
            items={config.sections.github.requirements}
            onChange={(requirements) => {
              setConfig((prev) => ({
                ...prev,
                sections: { ...prev.sections, github: { ...prev.sections.github, requirements } },
              }));
              setDirty(true);
            }}
            placeholder="Ej: Servidor Linux"
          />
        </div>
      );
    }

    if (active === 'useCases') {
      return (
        <div className="card p-6 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-dark-900 dark:text-white">Casos de uso</div>
            <label className="flex items-center gap-2 text-sm text-dark-700 dark:text-dark-300">
              <input
                type="checkbox"
                checked={config.sections.useCases.enabled}
                onChange={(e) => setSectionEnabled('useCases', e.target.checked)}
              />
              Activo
            </label>
          </div>

          <Input
            label="Título de sección"
            value={config.sections.useCases.title}
            onChange={(e) => {
              setConfig((prev) => ({
                ...prev,
                sections: { ...prev.sections, useCases: { ...prev.sections.useCases, title: e.target.value } },
              }));
              setDirty(true);
            }}
          />

          <CardListEditor
            title="Tarjetas"
            items={config.sections.useCases.items}
            onChange={(items) => {
              setConfig((prev) => ({
                ...prev,
                sections: { ...prev.sections, useCases: { ...prev.sections.useCases, items } },
              }));
              setDirty(true);
            }}
          />
        </div>
      );
    }

    if (active === 'faq') {
      return (
        <div className="card p-6 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-dark-900 dark:text-white">FAQ</div>
            <label className="flex items-center gap-2 text-sm text-dark-700 dark:text-dark-300">
              <input type="checkbox" checked={config.sections.faq.enabled} onChange={(e) => setSectionEnabled('faq', e.target.checked)} />
              Activo
            </label>
          </div>

          <Input
            label="Título de sección"
            value={config.sections.faq.title}
            onChange={(e) => {
              setConfig((prev) => ({
                ...prev,
                sections: { ...prev.sections, faq: { ...prev.sections.faq, title: e.target.value } },
              }));
              setDirty(true);
            }}
          />

          <FaqEditor
            faq={config.sections.faq}
            onChange={(next) => {
              setConfig((prev) => ({ ...prev, sections: { ...prev.sections, faq: next } }));
              setDirty(true);
            }}
          />
        </div>
      );
    }

    if (active === 'footer') {
      return (
        <div className="card p-6 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-dark-900 dark:text-white">Footer</div>
            <label className="flex items-center gap-2 text-sm text-dark-700 dark:text-dark-300">
              <input type="checkbox" checked={config.sections.footer.enabled} onChange={(e) => setSectionEnabled('footer', e.target.checked)} />
              Activo
            </label>
          </div>

          <FooterEditor
            footer={config.sections.footer}
            onChange={(next) => {
              setConfig((prev) => ({ ...prev, sections: { ...prev.sections, footer: next } }));
              setDirty(true);
            }}
          />
        </div>
      );
    }

    if (active === 'assets') {
      return (
        <div className="space-y-6">
          <div className="card p-6 space-y-6">
            <div>
              <div className="text-lg font-semibold text-dark-900 dark:text-white">Imágenes de la landing</div>
              <div className="text-sm text-dark-600 dark:text-dark-300">
                Opcional: si no subes imagen, se usa el mockup del hero.
              </div>
            </div>

            <AssetUploader
              title="Hero (imagen)"
              description="Reemplaza el mockup por una captura o imagen."
              value={config.assets?.heroImageUrl || ''}
              onUpload={(file) => uploadLandingAsset('hero', file)}
              onRemove={() => deleteLandingAsset('hero')}
            />

            <AssetUploader
              title="Features (imagen)"
              description="Imagen opcional dentro de la sección de características."
              value={config.assets?.featureImageUrl || ''}
              onUpload={(file) => uploadLandingAsset('feature', file)}
              onRemove={() => deleteLandingAsset('feature')}
            />
          </div>

          <div className="card p-6 space-y-6">
            <div>
              <div className="text-lg font-semibold text-dark-900 dark:text-white">Branding (logos & favicon)</div>
              <div className="text-sm text-dark-600 dark:text-dark-300">
                Esto usa el sistema de branding del panel de administración.
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <AssetUploader
                title="Logo (claro)"
                value={branding.logoLightUrl || ''}
                onUpload={(file) => uploadBrandingAsset('logo-light', file)}
              />
              <AssetUploader
                title="Logo (oscuro)"
                value={branding.logoDarkUrl || ''}
                onUpload={(file) => uploadBrandingAsset('logo-dark', file)}
              />
              <AssetUploader
                title="Favicon"
                value={branding.faviconUrl || ''}
                onUpload={(file) => uploadBrandingAsset('favicon', file)}
                accept="image/*"
              />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="card p-6">
        <div className="text-sm text-dark-600 dark:text-dark-300">Sección en construcción…</div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-dark-900 dark:text-white">{pageTitle}</h1>
          <p className="text-sm text-dark-500 dark:text-dark-400">{pageDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            icon={<Eye className="w-4 h-4" />}
            onClick={() => window.open('/landing', '_blank')}
          >
            Preview
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={<ExternalLink className="w-4 h-4" />}
            onClick={() => window.open(config.links.cloudUrl, '_blank')}
          >
            Abrir https://cloudbox.lat
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={<RotateCcw className="w-4 h-4" />}
            onClick={resetToDefault}
          >
            Reset
          </Button>
          <Button
            type="button"
            icon={<Save className="w-4 h-4" />}
            onClick={saveConfig}
            loading={saving}
            disabled={!dirty}
          >
            Guardar
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-3">
          <div className="rounded-2xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 p-3">
            <div className="text-xs font-semibold text-dark-500 dark:text-dark-400 px-2 py-2">SECCIONES</div>
            <div className="space-y-1">
              {nav.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActive(item.key)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-xl text-sm transition-colors',
                    active === item.key
                      ? 'bg-[#F44336]/10 text-dark-900 dark:text-white border border-[#F44336]/20'
                      : 'text-dark-600 dark:text-dark-300 hover:bg-dark-50 dark:hover:bg-dark-700/40 border border-transparent'
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 p-4">
            <div className="text-sm font-semibold text-dark-900 dark:text-white">Visibilidad</div>
            <div className="mt-3 space-y-2 text-sm text-dark-700 dark:text-dark-300">
              {(
                [
                  ['hero', 'Hero'],
                  ['benefits', 'Beneficios'],
                  ['howItWorks', 'Cómo funciona'],
                  ['features', 'Características'],
                  ['comparison', 'Comparativa'],
                  ['security', 'Seguridad'],
                  ['github', 'GitHub'],
                  ['useCases', 'Casos de uso'],
                  ['faq', 'FAQ'],
                  ['footer', 'Footer'],
                ] as Array<[keyof LandingConfigV1['sections'], string]>
              ).map(([key, label]) => (
                <label key={String(key)} className="flex items-center justify-between gap-3">
                  <span>{label}</span>
                  <input type="checkbox" checked={config.sections[key].enabled} onChange={(e) => setSectionEnabled(key, e.target.checked)} />
                </label>
              ))}
            </div>
          </div>
        </aside>

        <main className="lg:col-span-9 space-y-6">
          {loading ? (
            <div className="card p-8">
              <div className="text-sm text-dark-500 dark:text-dark-400">Cargando…</div>
            </div>
          ) : (
            renderPanel()
          )}
        </main>
      </div>
    </div>
  );
}
