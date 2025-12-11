
interface IconProps {
    className?: string;
    size?: number;
}

interface FileExtensionIconProps extends IconProps {
    extension: string;
}

// File icon with extension label in the center
export function FileExtensionIcon({ className = '', size = 64, extension }: FileExtensionIconProps) {
    // Format extension: uppercase, max 4 chars
    const ext = extension.toUpperCase().slice(0, 4);
    // Calculate font size based on extension length and icon size
    const fontSize = ext.length <= 2 ? size * 0.22 : ext.length === 3 ? size * 0.18 : size * 0.14;

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
            <path d="M30 4L44 18V20H32C29.7909 20 28 18.2091 28 16V4H30Z" opacity="0.7" />
            {/* Extension text */}
            <text
                x="24"
                y="46"
                textAnchor="middle"
                fontSize={fontSize}
                fontWeight="bold"
                fill="white"
                fontFamily="system-ui, -apple-system, sans-serif"
            >
                {ext}
            </text>
        </svg>
    );
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
