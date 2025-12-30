import { create } from 'zustand';
import { API_URL } from '../lib/api';

export type FileIconCategory =
    | 'folder' | 'folderShared' | 'folderProtected' | 'default'
    | 'image' | 'video' | 'audio'
    | 'pdf' | 'word' | 'spreadsheet' | 'presentation' | 'csv' | 'text' | 'markdown' | 'ebook'
    | 'onenote' | 'access' | 'publisher'
    | 'js' | 'html' | 'css' | 'py' | 'json' | 'sql'
    | 'illustrator' | 'photoshop' | 'indesign' | 'figma' | 'vector'
    | 'zip' | 'rar' | '7z'
    | 'exe' | 'dmg' | 'apk' | 'ipa' | 'deb' | 'rpm';

interface FileIconState {
    icons: Partial<Record<FileIconCategory, string | null>>;
    loading: boolean;
    loadIcons: () => Promise<void>;
    getIcon: (category: FileIconCategory) => string | null;
}

// Map file extensions to categories
const extensionToCategory: Record<string, FileIconCategory> = {
    // Multimedia
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', bmp: 'image', ico: 'image', tiff: 'image', heic: 'image',
    mp4: 'video', avi: 'video', mkv: 'video', mov: 'video', wmv: 'video', flv: 'video', webm: 'video', m4v: 'video',
    mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', ogg: 'audio', m4a: 'audio', wma: 'audio', opus: 'audio', mid: 'audio', midi: 'audio',

    // Documents
    pdf: 'pdf',
    doc: 'word', docx: 'word', odt: 'word',
    xls: 'spreadsheet', xlsx: 'spreadsheet', ods: 'spreadsheet',
    ppt: 'presentation', pptx: 'presentation', odp: 'presentation',
    csv: 'csv',
    txt: 'text', rtf: 'text', log: 'text',
    md: 'markdown',
    epub: 'ebook', mobi: 'ebook', azw3: 'ebook',

    // Suite Office Extra
    one: 'onenote',
    accdb: 'access', mdb: 'access',
    pub: 'publisher',

    // Programming & DB
    js: 'js', jsx: 'js',
    ts: 'js', tsx: 'js', // Mapping TS to JS icon or could be separate
    html: 'html', htm: 'html',
    css: 'css', scss: 'css', sass: 'css',
    py: 'py',
    json: 'json',
    sql: 'sql', sqlite: 'sql',

    // Design Professional
    ai: 'illustrator',
    psd: 'photoshop',
    indd: 'indesign',
    fig: 'figma',
    svg: 'vector',

    // Archives
    zip: 'zip',
    rar: 'rar',
    '7z': '7z',
    tar: 'zip', gz: 'zip', bz2: 'zip',

    // Systems & Installers
    exe: 'exe', msi: 'exe',
    dmg: 'dmg',
    apk: 'apk',
    ipa: 'ipa',
    deb: 'deb',
    rpm: 'rpm',
};

export const getCategoryFromExtension = (extension: string): FileIconCategory => {
    return extensionToCategory[extension.toLowerCase()] || 'default';
};

export const useFileIconStore = create<FileIconState>((set, get) => ({
    icons: {},
    loading: false,

    loadIcons: async () => {
        set({ loading: true });
        try {
            const res = await fetch(`${API_URL}/file-icons`, {
                credentials: 'include',
            });

            if (res.ok) {
                const data = await res.json();
                set({
                    icons: data || {},
                    loading: false,
                });
            } else {
                set({ loading: false });
            }
        } catch (error) {
            console.error('Failed to load file icons:', error);
            set({ loading: false });
        }
    },

    getIcon: (category: FileIconCategory) => {
        return get().icons[category] || null;
    },
}));
