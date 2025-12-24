import DOMPurify from 'dompurify';
import { useFileIconStore, getCategoryFromExtension, FileIconCategory } from '../../stores/fileIconStore';

interface IconProps {
    className?: string;
    size?: number;
}

interface FileExtensionIconProps extends IconProps {
    extension: string;
}

// Helper for landscape shape (Multimedia)
const LandscapeIcon = (className: string, size: number, children: React.ReactNode) => (
    <svg viewBox="0 0 64 48" width={size} height={size * 0.75} className={className} fill="currentColor">
        <path d="M8 4C5.79086 4 4 5.79086 4 8V40C4 42.2091 5.79086 44 8 44H56C58.2091 44 60 42.2091 60 40V14C60 11.7909 58.2091 10 56 10H32L28 4H8Z" />
        {children}
    </svg>
);

// Helper for square shape (Audio)
const SquareIcon = (className: string, size: number, children: React.ReactNode) => (
    <svg viewBox="0 0 48 48" width={size * 0.75} height={size * 0.75} className={className} fill="currentColor">
        <rect x="4" y="4" width="40" height="40" rx="8" />
        {children}
    </svg>
);

// Helper for document shape
const DocumentIcon = (className: string, size: number, glyph?: React.ReactNode) => (
    <svg viewBox="0 0 48 64" width={size * 0.75} height={size} className={className} fill="currentColor">
        <path d="M4 8C4 5.79086 5.79086 4 8 4H28V20C28 22.2091 29.7909 24 32 24H44V56C44 58.2091 42.2091 60 40 60H8C5.79086 60 4 58.2091 4 56V8Z" />
        <path d="M30 4L44 18V20H32C29.7909 20 28 18.2091 28 16V4H30Z" opacity="0.7" />
        {glyph}
    </svg>
);

// Default SVG icons for each category
const defaultIcons: Record<FileIconCategory, (className: string, size: number) => JSX.Element> = {
    folder: (className, size) => <SolidFolderIcon className={className} size={size} />,
    audio: (className, size) => SquareIcon(className, size, (
        <path d="M18 14V32C18 34.2091 16.2091 36 14 36C11.7909 36 10 34.2091 10 32C10 29.7909 11.7909 28 14 28C15.1046 28 16 28.4477 16 29V18L30 14V30C30 32.2091 28.2091 34 26 34C23.7909 34 22 32.2091 22 30C22 27.7909 23.7909 26 26 26C27.1046 26 28 26.4477 28 27" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" transform="translate(4, 4)" />
    )),
    image: (className, size) => LandscapeIcon(className, size, (
        <g transform="translate(8, 14)">
            <circle cx="10" cy="10" r="4" fill="white" fillOpacity="0.8" />
            <path d="M4 30L14 18L22 26L32 14L44 30H4Z" fill="white" fillOpacity="0.8" />
        </g>
    )),
    video: (className, size) => LandscapeIcon(className, size, (
        <path d="M24 18L44 30L24 42V18Z" fill="white" fillOpacity="0.8" />
    )),
    pdf: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="12" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">PDF</text>
    )),
    word: (className, size) => DocumentIcon(className, size, (
        <path d="M14 32L18 48L24 38L30 48L34 32" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8" />
    )),
    spreadsheet: (className, size) => DocumentIcon(className, size, (
        <g transform="translate(12, 30)" fill="white" fillOpacity="0.7">
            <rect x="0" y="0" width="10" height="6" rx="1" />
            <rect x="14" y="0" width="10" height="6" rx="1" />
            <rect x="0" y="10" width="10" height="6" rx="1" />
            <rect x="14" y="10" width="10" height="6" rx="1" />
        </g>
    )),
    presentation: (className, size) => DocumentIcon(className, size, (
        <g transform="translate(14, 34)" fill="white" fillOpacity="0.7">
            <rect x="0" y="6" width="6" height="10" rx="1" />
            <rect x="8" y="0" width="6" height="16" rx="1" />
            <rect x="16" y="4" width="6" height="12" rx="1" />
        </g>
    )),
    csv: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="11" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">CSV</text>
    )),
    text: (className, size) => DocumentIcon(className, size, (
        <g transform="translate(12, 32)" fill="white" fillOpacity="0.7">
            <rect x="0" y="0" width="24" height="2" rx="1" />
            <rect x="0" y="6" width="20" height="2" rx="1" />
            <rect x="0" y="12" width="16" height="2" rx="1" />
        </g>
    )),
    markdown: (className, size) => DocumentIcon(className, size, (
        <path d="M12 30H36V46H12V30ZM16 42V34L20 38L24 34V42M28 42L32 38H28V34H32" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8" />
    )),
    ebook: (className, size) => DocumentIcon(className, size, (
        <path d="M14 30V48C14 48 20 44 24 44C28 44 34 48 34 48V30C34 30 28 26 24 26C20 26 14 30 14 30Z" fill="white" fillOpacity="0.7" />
    )),
    onenote: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="16" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">N</text>
    )),
    access: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="16" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">A</text>
    )),
    publisher: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="16" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">P</text>
    )),

    // Programming
    js: (className, size) => DocumentIcon(className, size, (
        <path d="M18 34L12 40L18 46M30 34L36 40L30 46" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8" />
    )),
    html: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="12" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">HTML</text>
    )),
    css: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="12" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">CSS</text>
    )),
    py: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="12" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">PY</text>
    )),
    json: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="12" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">JSON</text>
    )),
    sql: (className, size) => DocumentIcon(className, size, (
        <g transform="translate(14, 30)" fill="white" fillOpacity="0.7">
            <ellipse cx="10" cy="4" rx="10" ry="4" />
            <path d="M0 4V16C0 18.2 4.5 20 10 20C15.5 20 20 18.2 20 16V4" />
            <path d="M0 10C0 12.2 4.5 14 10 14C15.5 14 20 12.2 20 10" />
        </g>
    )),

    // Design
    illustrator: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="14" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">Ai</text>
    )),
    photoshop: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="14" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">Ps</text>
    )),
    indesign: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="14" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">Id</text>
    )),
    figma: (className, size) => DocumentIcon(className, size, (
        <g transform="translate(18, 28)" fill="white" fillOpacity="0.8">
            <path d="M0 4C0 1.8 1.8 0 4 0H8V8H4C1.8 8 0 6.2 0 4Z" />
            <path d="M0 12C0 9.8 1.8 8 4 8H8V16H4C1.8 16 0 14.2 0 12Z" />
            <path d="M0 20C0 17.8 1.8 16 4 16H8V20C8 22.2 6.2 24 4 24C1.8 24 0 22.2 0 20Z" />
            <circle cx="12" cy="12" r="4" />
            <path d="M8 0H12C14.2 0 16 1.8 16 4C16 6.2 14.2 8 12 8H8V0Z" />
        </g>
    )),
    vector: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="12" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">SVG</text>
    )),

    // Archives
    zip: (className, size) => DocumentIcon(className, size, (
        <g transform="translate(20, 30)" fill="white" fillOpacity="0.7">
            <rect x="0" y="0" width="8" height="4" />
            <rect x="0" y="8" width="8" height="4" />
            <rect x="0" y="16" width="8" height="6" rx="2" />
        </g>
    )),
    rar: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="12" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">RAR</text>
    )),
    '7z': (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="12" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">7Z</text>
    )),

    // Systems
    exe: (className, size) => DocumentIcon(className, size, (
        <path d="M24 28V46M24 46L16 38M24 46L32 38M12 50H36" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8" />
    )),
    dmg: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="12" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">DMG</text>
    )),
    apk: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="12" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">APK</text>
    )),
    ipa: (className, size) => DocumentIcon(className, size, (
        <text x="24" y="46" textAnchor="middle" fontSize="12" fontWeight="bold" fill="white" fillOpacity="0.8" fontFamily="system-ui">IPA</text>
    )),
    deb: (className, size) => DocumentIcon(className, size, (
        <path d="M12 34L24 26L36 34L24 42L12 34Z" fill="white" fillOpacity="0.7" />
    )),
    rpm: (className, size) => DocumentIcon(className, size, (
        <path d="M12 34L24 26L36 34L24 42L12 34Z" fill="white" fillOpacity="0.7" />
    )),

    default: (className, size) => DocumentIcon(className, size),
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

    if (customSvg) {
        // Sanitize on frontend as defense in depth
        const sanitized = DOMPurify.sanitize(customSvg, {
            USE_PROFILES: { svg: true, svgFilters: true },
        });
        return (
            <div
                className={`custom-file-icon ${className}`}
                style={{ width: size * 0.75, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                dangerouslySetInnerHTML={{ __html: sanitized }}
            />
        );
    }

    // For known categories, use category-specific icon
    if (category !== 'default') {
        return defaultIcons[category](className, size);
    }

    // For unknown extensions, show extension text
    return renderExtensionText(className, size, ext);
}


// Solid folder icon matching the reference design
export function SolidFolderIcon({ className = '', size = 64 }: IconProps) {
    return (
        <svg
            viewBox="0 0 64 48"
            width={size}
            height={size * 0.75}
            className={className}
            fill="currentColor"
        >
            {/* Folder body */}
            <path d="M4 8C4 5.79086 5.79086 4 8 4H24L28 10H56C58.2091 10 60 11.7909 60 14V40C60 42.2091 58.2091 44 56 44H8C5.79086 44 4 42.2091 4 40V8Z" />
        </svg>
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
