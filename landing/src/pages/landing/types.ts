export type LandingCard = { id: string; icon: string; title: string; description: string };

export type LandingStep = { id: string; title: string; description: string };

export type LandingFeatureItem = { id: string; icon: string; title: string; description: string };

export type LandingFeatureGroup = {
  id: string;
  title: string;
  description?: string;
  items: LandingFeatureItem[];
};

export type LandingConfigV1 = {
  version: 1;
  links: {
    cloudUrl: string;
    appUrl: string;
    githubUrl: string;
    docsUrl?: string;
    supportUrl?: string;
  };
  assets?: {
    heroImageUrl?: string;
    featureImageUrl?: string;
  };
  sections: {
    hero: {
      enabled: boolean;
      title: string;
      subtitle: string;
      primaryCta: { label: string; href: string };
      secondaryCta: { label: string; href: string };
    };
    benefits: { enabled: boolean; title: string; items: LandingCard[] };
    howItWorks: {
      enabled: boolean;
      title: string;
      cloud: { title: string; steps: LandingStep[] };
      selfHosted: { title: string; steps: LandingStep[] };
    };
    features: { enabled: boolean; title: string; groups: LandingFeatureGroup[] };
    comparison: {
      enabled: boolean;
      title: string;
      cloud: { title: string; description: string; bullets: string[] };
      selfHosted: { title: string; description: string; bullets: string[] };
      rows: Array<{ id: string; label: string; cloud: string; selfHosted: string }>;
    };
    security: { enabled: boolean; title: string; body: string; points: string[] };
    github: { enabled: boolean; title: string; body: string; ctaLabel: string; requirements: string[] };
    useCases: { enabled: boolean; title: string; items: LandingCard[] };
    faq: { enabled: boolean; title: string; items: Array<{ id: string; question: string; answer: string }> };
    footer: {
      enabled: boolean;
      tagline: string;
      groups: Array<{ id: string; title: string; links: Array<{ id: string; label: string; href: string }> }>;
      finePrint?: string;
    };
  };
};

