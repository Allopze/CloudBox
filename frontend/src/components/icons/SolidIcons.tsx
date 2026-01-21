import DOMPurify from 'dompurify';
import { useFileIconStore, getCategoryFromExtension, FileIconCategory } from '../../stores/fileIconStore';

interface IconProps {
    className?: string;
    size?: number;
    style?: React.CSSProperties;
    IconComponent?: React.ComponentType<{ size?: number | string; className?: string }>;
}

interface FileExtensionIconProps extends IconProps {
    extension: string;
}

const iconModules = import.meta.glob('../../assets/icons/*.svg', {
    query: '?raw',
    import: 'default',
    eager: true,
});

const assetIcons = Object.fromEntries(
    Object.entries(iconModules)
        .map(([path, svg]) => {
            const filename = path.split('/').pop();
            return filename ? [filename, svg as string] : null;
        })
        .filter((entry): entry is [string, string] => Boolean(entry))
);

const DEFAULT_ICON_FILES: Record<FileIconCategory, string> = {
    folder: 'folder-icon.svg',
    folderShared: 'folder-shared.svg',
    folderProtected: 'folder-secure.svg',
    default: 'generic-file-icon.svg',
    image: 'img-icon.svg',
    video: 'video-icon.svg',
    audio: 'audio-icon.svg',
    pdf: 'pdf-icon.svg',
    word: 'docx-icon.svg',
    spreadsheet: 'xlsx-icon.svg',
    presentation: 'pptx-icon.svg',
    csv: 'xlsx-icon.svg',
    text: 'txt-icon.svg',
    markdown: 'md-icon.svg',
    ebook: 'epub-icon.svg',
    onenote: 'one-icon.svg',
    access: 'accdb-icon.svg',
    publisher: 'pub-icon.svg',
    js: 'js-icon.svg',
    html: 'html-icon.svg',
    css: 'css-icon.svg',
    py: 'py-icon.svg',
    json: 'json-icon.svg',
    sql: 'sql-icon.svg',
    illustrator: 'ai-icon.svg',
    photoshop: 'psd-icon.svg',
    indesign: 'indesign-icon.svg',
    figma: 'fig-icon.svg',
    vector: 'svg-icon.svg',
    zip: 'zip-icon.svg',
    rar: 'rar-icon.svg',
    '7z': '7z-icon.svg',
    exe: 'exe-icon.svg',
    dmg: 'dmg-icon.svg',
    apk: 'apk-icon.svg',
    ipa: 'ipa-icon.svg',
    deb: 'deb-icon.svg',
    rpm: 'rpm-icon.svg',
};

export const getDefaultIconSvg = (category: FileIconCategory): string | null => {
    const filename = DEFAULT_ICON_FILES[category];
    if (filename && assetIcons[filename]) {
        return assetIcons[filename];
    }

    return assetIcons['generic-file-icon.svg'] || null;
};

const sanitizeSvg = (svg: string): string => {
    return DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
    });
};

const renderSvgIcon = (svg: string, className: string, size: number, style?: React.CSSProperties) => {
    const sanitized = sanitizeSvg(svg);
    return (
        <div
            className={`custom-file-icon ${className}`}
            style={{
                width: size,
                height: size,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...style,
            }}
            dangerouslySetInnerHTML={{ __html: sanitized }}
        />
    );
};

// Render extension text on default icon
const renderExtensionText = (className: string, size: number, extension: string) => {
    const extText = extension ? extension.toUpperCase().slice(0, 4) : '?';
    const fontSize = extText.length <= 1 ? size * 0.25 : extText.length <= 2 ? size * 0.22 : extText.length === 3 ? size * 0.18 : size * 0.14;

    return (
        <svg viewBox="0 0 48 64" width={size * 0.75} height={size} className={className} fill="currentColor">
            <path d="M4 8C4 5.79086 5.79086 4 8 4H28V20C28 22.2091 29.7909 24 32 24H44V56C44 58.2091 42.2091 60 40 60H8C5.79086 60 4 58.2091 4 56V8Z" />
            <path d="M30 4L44 18V20H32C29.7909 20 28 18.2091 28 16V4H30Z" opacity="0.7" />
            <text x="24" y="46" textAnchor="middle" fontSize={fontSize} fontWeight="900" fill="white" fontFamily="system-ui, -apple-system, sans-serif">
                {extText}
            </text>
        </svg>
    );
};

// File icon component with custom icon support
export function FileExtensionIcon({ className = '', size = 64, extension }: FileExtensionIconProps) {
    const ext = extension.toLowerCase();
    const category = getCategoryFromExtension(ext);

    // Use optimized selector to prevent unnecessary re-renders
    const customSvg = useFileIconStore(state => state.icons[category]);

    const defaultSvg = getDefaultIconSvg(category);
    const svgToRender = customSvg || defaultSvg;

    if (svgToRender) {
        return renderSvgIcon(svgToRender, className, size);
    }

    // For unknown extensions, show extension text
    return renderExtensionText(className, size, ext);
}


// Solid folder icon matching the reference design with optional inner icon
export function SolidFolderIcon({ className = '', size = 64, style, IconComponent }: IconProps) {
    const defaultFolderSvg = getDefaultIconSvg('folder');
    const shouldUseDefaultSvg = !IconComponent && !style?.color && defaultFolderSvg;

    if (shouldUseDefaultSvg) {
        return renderSvgIcon(defaultFolderSvg, className, size, style);
    }

    // Extract the fill color from style.color or use default red
    const fillColor = style?.color || '#dc2626';
    // Keep the inner icon smaller and centered within the lighter folder area
    const innerIconSize = Math.round(size * 0.32);
    const overlayTop = size * (10 / 24);
    const overlayHeight = size * (10 / 24);

    return (
        <div className={className} style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg
                viewBox="0 0 24 24"
                width={size}
                height={size}
                style={{ position: 'absolute', top: 0, left: 0 }}
            >
                {/* Folder body with custom color */}
                <path
                    d="M3 7C3 5.89543 3.89543 5 5 5H9.58579C10.1162 5 10.625 5.21071 11 5.58579L13.4142 8H19C20.1046 8 21 8.89543 21 10V18C21 19.1046 20.1046 20 19 20H5C3.89543 20 3 19.1046 3 18V7Z"
                    fill={fillColor}
                />
                {/* White overlay for depth effect */}
                <path
                    d="M3 10H21V18C21 19.1046 20.1046 20 19 20H5C3.89543 20 3 19.1046 3 18V10Z"
                    fill="white"
                    opacity="0.15"
                />
            </svg>
            {/* Inner icon centered on the folder */}
            {IconComponent && (
                <div
                    style={{
                        position: 'absolute',
                        top: overlayTop,
                        left: 0,
                        width: size,
                        height: overlayHeight,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1,
                    }}
                >
                    <IconComponent size={innerIconSize} className="text-white/90" />
                </div>
            )}
        </div>
    );
}

// Solid file icon with folded corner matching the reference design
export function SolidFileIcon({ className = '', size = 64 }: IconProps) {
    return (
        <svg
            viewBox="0 0 48 64"
            width={size * 0.75}
            height={size}
            className={className}
            fill="currentColor"
        >
            {/* File body */}
            <path d="M4 8C4 5.79086 5.79086 4 8 4H28V20C28 22.2091 29.7909 24 32 24H44V56C44 58.2091 42.2091 60 40 60H8C5.79086 60 4 58.2091 4 56V8Z" />
            {/* Folded corner */}
            <path d="M30 4L44 18V20H32C29.7909 20 28 18.2091 28 16V4H30Z" opacity="0.8" />
        </svg>
    );
}

// Solid image file icon
export function SolidImageIcon({ className = '', size = 64 }: IconProps) {
    return (
        <svg
            viewBox="0 0 48 64"
            width={size * 0.75}
            height={size}
            className={className}
            fill="currentColor"
        >
            {/* File body */}
            <path d="M4 8C4 5.79086 5.79086 4 8 4H28V20C28 22.2091 29.7909 24 32 24H44V56C44 58.2091 42.2091 60 40 60H8C5.79086 60 4 58.2091 4 56V8Z" />
            {/* Folded corner */}
            <path d="M30 4L44 18V20H32C29.7909 20 28 18.2091 28 16V4H30Z" opacity="0.8" />
            {/* Mountain/image symbol */}
            <path
                d="M12 44L20 34L26 40L34 30L40 44H12Z"
                fill="currentColor"
                className="opacity-30"
            />
            <circle cx="18" cy="32" r="4" fill="currentColor" className="opacity-30" />
        </svg>
    );
}

// Solid video file icon
export function SolidVideoIcon({ className = '', size = 64 }: IconProps) {
    return (
        <svg
            viewBox="0 0 48 64"
            width={size * 0.75}
            height={size}
            className={className}
            fill="currentColor"
        >
            {/* File body */}
            <path d="M4 8C4 5.79086 5.79086 4 8 4H28V20C28 22.2091 29.7909 24 32 24H44V56C44 58.2091 42.2091 60 40 60H8C5.79086 60 4 58.2091 4 56V8Z" />
            {/* Folded corner */}
            <path d="M30 4L44 18V20H32C29.7909 20 28 18.2091 28 16V4H30Z" opacity="0.8" />
            {/* Play button */}
            <path
                d="M20 32L32 40L20 48V32Z"
                fill="currentColor"
                className="opacity-30"
            />
        </svg>
    );
}

// Solid music file icon
export function SolidMusicIcon({ className = '', size = 64 }: IconProps) {
    return (
        <svg
            viewBox="0 0 48 64"
            width={size * 0.75}
            height={size}
            className={className}
            fill="currentColor"
        >
            {/* File body */}
            <path d="M4 8C4 5.79086 5.79086 4 8 4H28V20C28 22.2091 29.7909 24 32 24H44V56C44 58.2091 42.2091 60 40 60H8C5.79086 60 4 58.2091 4 56V8Z" />
            {/* Folded corner */}
            <path d="M30 4L44 18V20H32C29.7909 20 28 18.2091 28 16V4H30Z" opacity="0.8" />
            {/* Music note */}
            <path
                d="M30 30V44C30 46.2091 28.2091 48 26 48C23.7909 48 22 46.2091 22 44C22 41.7909 23.7909 40 26 40C27.1046 40 28 40.4477 28 41V34L34 32V46C34 48.2091 32.2091 50 30 50C27.7909 50 26 48.2091 26 46"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="opacity-30"
            />
        </svg>
    );
}

// Solid archive/zip file icon
export function SolidArchiveIcon({ className = '', size = 64 }: IconProps) {
    return (
        <svg
            viewBox="0 0 48 64"
            width={size * 0.75}
            height={size}
            className={className}
            fill="currentColor"
        >
            {/* File body */}
            <path d="M4 8C4 5.79086 5.79086 4 8 4H28V20C28 22.2091 29.7909 24 32 24H44V56C44 58.2091 42.2091 60 40 60H8C5.79086 60 4 58.2091 4 56V8Z" />
            {/* Folded corner */}
            <path d="M30 4L44 18V20H32C29.7909 20 28 18.2091 28 16V4H30Z" opacity="0.8" />
            {/* Zipper pattern */}
            <rect x="20" y="28" width="8" height="4" fill="currentColor" className="opacity-30" />
            <rect x="20" y="36" width="8" height="4" fill="currentColor" className="opacity-30" />
            <rect x="20" y="44" width="8" height="6" rx="2" fill="currentColor" className="opacity-30" />
        </svg>
    );
}

// Solid PDF file icon
export function SolidPdfIcon({ className = '', size = 64 }: IconProps) {
    return (
        <svg
            viewBox="0 0 48 64"
            width={size * 0.75}
            height={size}
            className={className}
            fill="currentColor"
        >
            {/* File body */}
            <path d="M4 8C4 5.79086 5.79086 4 8 4H28V20C28 22.2091 29.7909 24 32 24H44V56C44 58.2091 42.2091 60 40 60H8C5.79086 60 4 58.2091 4 56V8Z" />
            {/* Folded corner */}
            <path d="M30 4L44 18V20H32C29.7909 20 28 18.2091 28 16V4H30Z" opacity="0.8" />
            {/* PDF text */}
            <text
                x="24"
                y="46"
                textAnchor="middle"
                fontSize="12"
                fontWeight="bold"
                fill="currentColor"
                className="opacity-40"
            >
                PDF
            </text>
        </svg>
    );
}

// Solid Word document icon
export function SolidWordIcon({ className = '', size = 64 }: IconProps) {
    return (
        <svg
            viewBox="0 0 48 64"
            width={size * 0.75}
            height={size}
            className={className}
            fill="currentColor"
        >
            {/* File body */}
            <path d="M4 8C4 5.79086 5.79086 4 8 4H28V20C28 22.2091 29.7909 24 32 24H44V56C44 58.2091 42.2091 60 40 60H8C5.79086 60 4 58.2091 4 56V8Z" />
            {/* Folded corner */}
            <path d="M30 4L44 18V20H32C29.7909 20 28 18.2091 28 16V4H30Z" opacity="0.8" />
            {/* W letter */}
            <path
                d="M14 32L18 48L24 38L30 48L34 32"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-40"
            />
        </svg>
    );
}

// Solid Excel spreadsheet icon
export function SolidExcelIcon({ className = '', size = 64 }: IconProps) {
    return (
        <svg
            viewBox="0 0 48 64"
            width={size * 0.75}
            height={size}
            className={className}
            fill="currentColor"
        >
            {/* File body */}
            <path d="M4 8C4 5.79086 5.79086 4 8 4H28V20C28 22.2091 29.7909 24 32 24H44V56C44 58.2091 42.2091 60 40 60H8C5.79086 60 4 58.2091 4 56V8Z" />
            {/* Folded corner */}
            <path d="M30 4L44 18V20H32C29.7909 20 28 18.2091 28 16V4H30Z" opacity="0.8" />
            {/* Grid pattern */}
            <rect x="12" y="32" width="10" height="6" fill="currentColor" className="opacity-30" />
            <rect x="26" y="32" width="10" height="6" fill="currentColor" className="opacity-30" />
            <rect x="12" y="42" width="10" height="6" fill="currentColor" className="opacity-30" />
            <rect x="26" y="42" width="10" height="6" fill="currentColor" className="opacity-30" />
        </svg>
    );
}

// Solid PowerPoint presentation icon
export function SolidPowerPointIcon({ className = '', size = 64 }: IconProps) {
    return (
        <svg
            viewBox="0 0 48 64"
            width={size * 0.75}
            height={size}
            className={className}
            fill="currentColor"
        >
            {/* File body */}
            <path d="M4 8C4 5.79086 5.79086 4 8 4H28V20C28 22.2091 29.7909 24 32 24H44V56C44 58.2091 42.2091 60 40 60H8C5.79086 60 4 58.2091 4 56V8Z" />
            {/* Folded corner */}
            <path d="M30 4L44 18V20H32C29.7909 20 28 18.2091 28 16V4H30Z" opacity="0.8" />
            {/* Presentation bar chart */}
            <rect x="14" y="40" width="6" height="10" fill="currentColor" className="opacity-30" />
            <rect x="22" y="34" width="6" height="16" fill="currentColor" className="opacity-30" />
            <rect x="30" y="38" width="6" height="12" fill="currentColor" className="opacity-30" />
        </svg>
    );
}

// Solid Code file icon
export function SolidCodeIcon({ className = '', size = 64 }: IconProps) {
    return (
        <svg
            viewBox="0 0 48 64"
            width={size * 0.75}
            height={size}
            className={className}
            fill="currentColor"
        >
            {/* File body */}
            <path d="M4 8C4 5.79086 5.79086 4 8 4H28V20C28 22.2091 29.7909 24 32 24H44V56C44 58.2091 42.2091 60 40 60H8C5.79086 60 4 58.2091 4 56V8Z" />
            {/* Folded corner */}
            <path d="M30 4L44 18V20H32C29.7909 20 28 18.2091 28 16V4H30Z" opacity="0.8" />
            {/* Code brackets */}
            <path
                d="M18 34L12 40L18 46M30 34L36 40L30 46"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-40"
            />
        </svg>
    );
}

// Solid Text document icon
export function SolidTextIcon({ className = '', size = 64 }: IconProps) {
    return (
        <svg
            viewBox="0 0 48 64"
            width={size * 0.75}
            height={size}
            className={className}
            fill="currentColor"
        >
            {/* File body */}
            <path d="M4 8C4 5.79086 5.79086 4 8 4H28V20C28 22.2091 29.7909 24 32 24H44V56C44 58.2091 42.2091 60 40 60H8C5.79086 60 4 58.2091 4 56V8Z" />
            {/* Folded corner */}
            <path d="M30 4L44 18V20H32C29.7909 20 28 18.2091 28 16V4H30Z" opacity="0.8" />
            {/* Text lines */}
            <rect x="12" y="32" width="24" height="2" rx="1" fill="currentColor" className="opacity-30" />
            <rect x="12" y="38" width="20" height="2" rx="1" fill="currentColor" className="opacity-30" />
            <rect x="12" y="44" width="16" height="2" rx="1" fill="currentColor" className="opacity-30" />
        </svg>
    );
}

export default SolidFileIcon;
