import type { LandingConfigV1 } from './types';

export const FALLBACK_LANDING_CONFIG: LandingConfigV1 = {
  version: 1,
  links: {
    cloudUrl: 'https://cloudbox.lat',
    appUrl: '/login',
    githubUrl: 'https://github.com',
    docsUrl: '',
    supportUrl: '',
  },
  assets: {
    heroImageUrl: '',
    featureImageUrl: '',
  },
  sections: {
    hero: {
      enabled: true,
      title: 'Tu nube privada, con control total sobre tus archivos.',
      subtitle:
        'CloudBox es una nube privada con la experiencia de una app moderna de almacenamiento de archivos. Úsala directamente en https://cloudbox.lat o autohospédala tú mismo desde GitHub para tener tu propia nube privada.',
      primaryCta: { label: 'Entrar a CloudBox', href: '/login' },
      secondaryCta: { label: 'Ver en GitHub', href: 'https://github.com' },
    },
    benefits: {
      enabled: true,
      title: 'Beneficios clave',
      items: [
        {
          id: 'control-total',
          icon: 'ShieldCheck',
          title: 'Control total',
          description:
            'Decide dónde viven tus archivos: usa CloudBox en la nube o en tu propio servidor con una instancia privada de confianza.',
        },
        {
          id: 'experiencia-moderna',
          icon: 'Sparkles',
          title: 'Experiencia moderna',
          description:
            'Interfaz rápida y familiar, pensada para gestionar archivos como lo harías en un explorador: organizar, buscar y previsualizar.',
        },
        {
          id: 'compartir-sin-friccion',
          icon: 'Link2',
          title: 'Compartir sin fricción',
          description:
            'Genera enlaces para compartir archivos y carpetas cuando lo necesites, sin depender de servicios externos para tu flujo diario.',
        },
        {
          id: 'para-hogares-y-equipos',
          icon: 'Users',
          title: 'Para hogares y equipos',
          description:
            'Ideal para familias, homelabs, equipos pequeños y creadores de contenido que manejan muchos archivos y necesitan orden.',
        },
      ],
    },
    howItWorks: {
      enabled: true,
      title: 'Cómo funciona',
      cloud: {
        title: 'Usar CloudBox en la nube',
        steps: [
          {
            id: 'cloud-1',
            title: 'Entra a https://cloudbox.lat',
            description: 'Accede a la versión en la nube desde el navegador.',
          },
          {
            id: 'cloud-2',
            title: 'Inicia sesión o crea tu cuenta',
            description: 'Entra a tu espacio de CloudBox y comienza a organizar.',
          },
          {
            id: 'cloud-3',
            title: 'Sube y organiza tus archivos',
            description: 'Crea carpetas, mueve elementos y mantén tu nube ordenada.',
          },
          {
            id: 'cloud-4',
            title: 'Comparte y accede cuando quieras',
            description: 'Comparte enlaces y gestiona tus archivos desde cualquier lugar.',
          },
        ],
      },
      selfHosted: {
        title: 'Autohospedar CloudBox en tu servidor',
        steps: [
          {
            id: 'self-1',
            title: 'Visita el repositorio en GitHub',
            description: 'Revisa el proyecto, la documentación y los pasos de instalación.',
          },
          {
            id: 'self-2',
            title: 'Instala y despliega en tu infraestructura',
            description: 'Ejecuta CloudBox en un servidor Linux en casa o en un VPS.',
          },
          {
            id: 'self-3',
            title: 'Configura almacenamiento y acceso',
            description: 'Define dónde se guardan los datos, cómo se respaldan y quién puede entrar.',
          },
          {
            id: 'self-4',
            title: 'Usa tu CloudBox privado',
            description: 'Accede a tu propia nube y gestiona tus archivos con la misma experiencia moderna.',
          },
        ],
      },
    },
    features: {
      enabled: true,
      title: 'Características en detalle',
      groups: [
        {
          id: 'gestion-archivos',
          title: 'Gestión de archivos y carpetas',
          description: 'Acciones esenciales, rápidas y familiares.',
          items: [
            {
              id: 'drag-drop',
              icon: 'UploadCloud',
              title: 'Subida con arrastrar y soltar',
              description: 'Sube archivos de forma simple arrastrándolos a tu espacio.',
            },
            {
              id: 'folders',
              icon: 'FolderPlus',
              title: 'Carpetas y organización',
              description: 'Crea, renombra, mueve y elimina carpetas para mantener todo ordenado.',
            },
            {
              id: 'file-actions',
              icon: 'FileText',
              title: 'Acciones de archivo',
              description: 'Renombra, mueve y elimina archivos con un flujo rápido y claro.',
            },
          ],
        },
        {
          id: 'vistas-busqueda',
          title: 'Vistas, búsqueda y navegación',
          description: 'Encuentra lo que necesitas sin fricción.',
          items: [
            {
              id: 'list-grid',
              icon: 'LayoutGrid',
              title: 'Vista de lista y/o cuadrícula',
              description: 'Elige la vista que mejor se adapte a tu forma de trabajar.',
            },
            {
              id: 'search',
              icon: 'Search',
              title: 'Búsqueda de archivos',
              description: 'Localiza archivos y carpetas rápidamente.',
            },
            {
              id: 'preview',
              icon: 'Image',
              title: 'Vista previa',
              description: 'Previsualiza imágenes y documentos para ahorrar tiempo.',
            },
          ],
        },
        {
          id: 'compartir-grandes',
          title: 'Compartir y archivos grandes',
          description: 'Pensado para flujos reales y grandes volúmenes.',
          items: [
            {
              id: 'links',
              icon: 'Link',
              title: 'Copiar enlaces de descarga',
              description: 'Comparte accesos a tus archivos con enlaces listos para usar.',
            },
            {
              id: 'large-files',
              icon: 'HardDrive',
              title: 'Soporte para archivos grandes',
              description: 'Diseñado para manejar archivos pesados y grandes volúmenes de datos.',
            },
            {
              id: 'self-hosted',
              icon: 'Server',
              title: 'Autohospedable',
              description: 'Ideal para homelabs y equipos que quieren controlar su infraestructura.',
            },
          ],
        },
      ],
    },
    comparison: {
      enabled: true,
      title: 'CloudBox en la nube vs CloudBox autohospedado',
      cloud: {
        title: 'Usar CloudBox en https://cloudbox.lat',
        description: 'Listo para usar, sin instalación ni mantenimiento.',
        bullets: ['Empieza en minutos', 'Actualizaciones gestionadas', 'Ideal si quieres simplicidad'],
      },
      selfHosted: {
        title: 'Autohospedarlo en tu servidor',
        description: 'Control total de tu infraestructura y tus datos.',
        bullets: ['Datos almacenados en tu servidor', 'Integración con tu red/homelab', 'Personalización y control máximo'],
      },
      rows: [
        { id: 'row-setup', label: 'Puesta en marcha', cloud: 'Entrar y usar', selfHosted: 'Instalar y configurar' },
        { id: 'row-infra', label: 'Infraestructura', cloud: 'Gestionada', selfHosted: 'Bajo tu control' },
        { id: 'row-data', label: 'Ubicación de los datos', cloud: 'En la nube (instancia de CloudBox)', selfHosted: 'En tu servidor' },
        { id: 'row-maint', label: 'Mantenimiento', cloud: 'Mínimo', selfHosted: 'A tu cargo' },
        { id: 'row-custom', label: 'Personalización', cloud: 'Estándar', selfHosted: 'Máxima' },
      ],
    },
    security: {
      enabled: true,
      title: 'Seguridad y privacidad',
      body:
        'CloudBox está pensado como una nube privada: no es una plataforma de explotación de datos. Tus archivos y tu información pertenecen a ti. La comunicación se realiza por HTTPS (cifrado en tránsito) y, si autohospedas, tú defines dónde se almacenan los datos, cómo se respaldan y quién tiene acceso.',
      points: [
        'HTTPS: cifrado en tránsito para tu sesión y tus archivos',
        'Filosofía de privacidad: tus datos no son el producto',
        'Autohospedaje: control total de almacenamiento, backups y acceso',
      ],
    },
    github: {
      enabled: true,
      title: 'Proyecto técnico y código abierto',
      body:
        'CloudBox también es un proyecto autohospedable disponible en GitHub. Puedes revisarlo, auditarlo, descargarlo, contribuir con mejoras o abrir issues.',
      ctaLabel: 'Ver repositorio en GitHub',
      requirements: [
        'Servidor con sistema operativo basado en Linux',
        'Conexión a internet y un dominio (opcional)',
        'Almacenamiento suficiente para tus archivos',
      ],
    },
    useCases: {
      enabled: true,
      title: 'Casos de uso',
      items: [
        {
          id: 'use-family',
          icon: 'Home',
          title: 'Familias',
          description: 'Una nube privada compartida para fotos, documentos y archivos del hogar.',
        },
        {
          id: 'use-office',
          icon: 'Building2',
          title: 'Pequeñas oficinas',
          description: 'Gestión de documentos internos y colaboración simple sin depender de terceros.',
        },
        {
          id: 'use-creators',
          icon: 'Video',
          title: 'Creadores de contenido',
          description: 'Archivos pesados, proyectos y backups en un espacio organizado.',
        },
        {
          id: 'use-homelab',
          icon: 'Cpu',
          title: 'Homelabs',
          description: 'Centraliza backups, fotos y vídeos en tu propia infraestructura.',
        },
      ],
    },
    faq: {
      enabled: true,
      title: 'Preguntas frecuentes',
      items: [
        {
          id: 'faq-server',
          question: '¿Necesito un servidor para usar CloudBox?',
          answer:
            'No. Puedes usar CloudBox directamente en https://cloudbox.lat desde la web. Si quieres control total, también puedes autohospedarlo en tu propio servidor desde el repositorio de GitHub.',
        },
        {
          id: 'faq-diff',
          question: '¿Qué diferencia hay entre usar CloudBox en la nube y autohospedarlo?',
          answer:
            'En la nube (https://cloudbox.lat) no instalas nada: entras y lo usas. Al autohospedarlo, tú administras la infraestructura y decides dónde y cómo se almacenan los datos.',
        },
        {
          id: 'faq-mobile',
          question: '¿Puedo acceder desde el móvil?',
          answer:
            'Sí. CloudBox se usa desde el navegador y está diseñado para verse bien en pantallas pequeñas, tablets y escritorio.',
        },
        {
          id: 'faq-downtime',
          question: '¿Qué pasa si mi servidor se apaga (autohospedado)?',
          answer:
            'Tu instancia autohospedada dejará de estar disponible hasta que tu servidor vuelva a estar en línea. Por eso es importante planificar backups y la disponibilidad según tu caso.',
        },
        {
          id: 'faq-free',
          question: '¿CloudBox es gratuito?',
          answer:
            'El proyecto autohospedable está disponible en GitHub. El modo nube (https://cloudbox.lat) puede tener condiciones o planes distintos según la operación del servicio.',
        },
        {
          id: 'faq-skills',
          question: '¿Necesito conocimientos avanzados para instalarlo?',
          answer:
            'Para autohospedar CloudBox necesitas seguir la documentación y administrar un servidor. Si prefieres no ocuparte de mantenimiento, usa CloudBox en https://cloudbox.lat.',
        },
      ],
    },
    footer: {
      enabled: true,
      tagline: 'CloudBox: nube privada moderna para tus archivos, en la nube o en tu servidor.',
      groups: [
        {
          id: 'footer-product',
          title: 'Producto',
          links: [
            { id: 'footer-login', label: 'Entrar a CloudBox', href: '/login' },
            { id: 'footer-github', label: 'Ver en GitHub', href: 'https://github.com' },
          ],
        },
        {
          id: 'footer-legal',
          title: 'Legal',
          links: [
            { id: 'footer-terms', label: 'Términos de servicio', href: '/terms' },
            { id: 'footer-privacy', label: 'Política de privacidad', href: '/privacy' },
          ],
        },
        {
          id: 'footer-labs',
          title: 'CloudBox Labs',
          links: [{ id: 'footer-labs-about', label: 'Sobre CloudBox Labs', href: '#' }],
        },
      ],
      finePrint: '© CloudBox. Todos los derechos reservados.',
    },
  },
};

