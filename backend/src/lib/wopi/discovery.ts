/**
 * WOPI Discovery Service
 * 
 * Fetches and caches WOPI client discovery XML.
 * Resolves action URLs by file extension and mode.
 */

import { config } from '../../config/index.js';
import logger from '../logger.js';

interface WopiAction {
    name: string;
    ext: string;
    urlsrc: string;
    requires?: string;
}

interface WopiApp {
    name: string;
    favIconUrl?: string;
    actions: WopiAction[];
}

interface DiscoveryCache {
    apps: WopiApp[];
    fetchedAt: number;
    etag?: string;
}

let discoveryCache: DiscoveryCache | null = null;

/**
 * Parse WOPI discovery XML into structured data
 */
function parseDiscoveryXml(xmlText: string): WopiApp[] {
    const apps: WopiApp[] = [];

    // Simple XML parsing for WOPI discovery format
    // Format: <wopi-discovery><net-zone><app name="..."><action name="..." ext="..." urlsrc="..."/></app></net-zone></wopi-discovery>

    const appRegex = /<app\s+name="([^"]+)"[^>]*(?:favIconUrl="([^"]*)")?[^>]*>([\s\S]*?)<\/app>/gi;
    const actionRegex = /<action\s+([^>]+)\/?>/gi;
    const attrRegex = /(\w+)="([^"]*)"/g;

    let appMatch;
    while ((appMatch = appRegex.exec(xmlText)) !== null) {
        const appName = appMatch[1];
        const favIconUrl = appMatch[2];
        const appContent = appMatch[3];
        const actions: WopiAction[] = [];

        let actionMatch;
        const actionRegexLocal = /<action\s+([^>]+)\/?>/gi;
        while ((actionMatch = actionRegexLocal.exec(appContent)) !== null) {
            const attrs: Record<string, string> = {};
            let attrMatch;
            const attrRegexLocal = /(\w+)="([^"]*)"/g;
            while ((attrMatch = attrRegexLocal.exec(actionMatch[1])) !== null) {
                attrs[attrMatch[1]] = attrMatch[2];
            }

            if (attrs.name && attrs.urlsrc) {
                actions.push({
                    name: attrs.name,
                    ext: attrs.ext || '',
                    urlsrc: attrs.urlsrc,
                    requires: attrs.requires,
                });
            }
        }

        if (actions.length > 0) {
            apps.push({ name: appName, favIconUrl, actions });
        }
    }

    return apps;
}

/**
 * Fetch discovery from WOPI client
 */
async function fetchDiscovery(): Promise<WopiApp[]> {
    const discoveryUrl = config.wopi.discoveryUrl;

    if (!discoveryUrl) {
        throw new Error('WOPI_DISCOVERY_URL not configured');
    }

    const headers: Record<string, string> = {};
    if (discoveryCache?.etag) {
        headers['If-None-Match'] = discoveryCache.etag;
    }

    const response = await fetch(discoveryUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (response.status === 304 && discoveryCache) {
        // Not modified - update fetch time and return cached
        discoveryCache.fetchedAt = Date.now();
        return discoveryCache.apps;
    }

    if (!response.ok) {
        throw new Error(`Discovery fetch failed: ${response.status} ${response.statusText}`);
    }

    const xmlText = await response.text();
    const apps = parseDiscoveryXml(xmlText);

    if (apps.length === 0) {
        throw new Error('No applications found in discovery XML');
    }

    // Update cache
    discoveryCache = {
        apps,
        fetchedAt: Date.now(),
        etag: response.headers.get('etag') || undefined,
    };

    logger.info('WOPI discovery refreshed', { appCount: apps.length });

    return apps;
}

/**
 * Get cached discovery or fetch if stale
 */
export async function getDiscovery(): Promise<WopiApp[]> {
    const ttlMs = config.wopi.discoveryTtlSeconds * 1000;

    if (discoveryCache && (Date.now() - discoveryCache.fetchedAt) < ttlMs) {
        return discoveryCache.apps;
    }

    try {
        return await fetchDiscovery();
    } catch (error) {
        // If we have stale cache, use it as fallback
        if (discoveryCache) {
            logger.warn('Failed to refresh discovery, using stale cache', {
                error: error instanceof Error ? error.message : 'Unknown',
                cacheAge: Date.now() - discoveryCache.fetchedAt,
            });
            return discoveryCache.apps;
        }
        throw error;
    }
}

/**
 * Map of file extensions to their action names
 */
const ACTION_MAP: Record<string, { view: string; edit: string }> = {
    // Word documents
    docx: { view: 'view', edit: 'edit' },
    doc: { view: 'view', edit: 'edit' },
    odt: { view: 'view', edit: 'edit' },
    rtf: { view: 'view', edit: 'edit' },

    // Excel spreadsheets
    xlsx: { view: 'view', edit: 'edit' },
    xls: { view: 'view', edit: 'edit' },
    ods: { view: 'view', edit: 'edit' },
    csv: { view: 'view', edit: 'edit' },

    // PowerPoint presentations
    pptx: { view: 'view', edit: 'edit' },
    ppt: { view: 'view', edit: 'edit' },
    odp: { view: 'view', edit: 'edit' },

    // PDF (view only usually)
    pdf: { view: 'view', edit: 'view' },
};

/**
 * Get action URL for a file extension and mode
 */
export async function getActionUrl(
    extension: string,
    mode: 'view' | 'edit'
): Promise<{ url: string; app: string } | null> {
    const ext = extension.toLowerCase().replace(/^\./, '');
    const apps = await getDiscovery();

    const actionNames = ACTION_MAP[ext];
    if (!actionNames) {
        return null;
    }

    const targetAction = actionNames[mode];

    for (const app of apps) {
        for (const action of app.actions) {
            // Match by extension and action name
            if (action.ext?.toLowerCase() === ext && action.name === targetAction) {
                return { url: action.urlsrc, app: app.name };
            }
        }
    }

    // Fallback: try to find any matching extension with view action
    if (mode === 'view') {
        for (const app of apps) {
            for (const action of app.actions) {
                if (action.ext?.toLowerCase() === ext) {
                    return { url: action.urlsrc, app: app.name };
                }
            }
        }
    }

    return null;
}

/**
 * Check if a file extension is supported by the WOPI client
 */
export async function isExtensionSupported(extension: string): Promise<boolean> {
    try {
        const ext = extension.toLowerCase().replace(/^\./, '');
        const apps = await getDiscovery();

        for (const app of apps) {
            for (const action of app.actions) {
                if (action.ext?.toLowerCase() === ext) {
                    return true;
                }
            }
        }

        return false;
    } catch {
        return false;
    }
}

/**
 * Get list of supported extensions from discovery
 */
export async function getSupportedExtensions(): Promise<string[]> {
    try {
        const apps = await getDiscovery();
        const extensions = new Set<string>();

        for (const app of apps) {
            for (const action of app.actions) {
                if (action.ext) {
                    extensions.add(action.ext.toLowerCase());
                }
            }
        }

        return Array.from(extensions);
    } catch {
        return [];
    }
}

/**
 * Clear discovery cache (for testing or forced refresh)
 */
export function clearDiscoveryCache(): void {
    discoveryCache = null;
}
