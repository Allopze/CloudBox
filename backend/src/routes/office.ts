/**
 * Office Host Page Route
 * 
 * Renders the host page that loads the WOPI client in an iframe.
 * GET /office/open/{fileId}?mode=view|edit
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import prisma from '../lib/prisma.js';
import { config } from '../config/index.js';
import logger from '../lib/logger.js';
import { isValidUUID } from '../lib/storage.js';
import { authenticate } from '../middleware/auth.js';
import { generateWopiToken, WopiScope } from '../lib/wopi/token.js';
import { getActionUrl, isExtensionSupported } from '../lib/wopi/discovery.js';

const router = Router();

/**
 * Check if user has access to file
 */
async function checkFileAccess(
    fileId: string,
    userId: string
): Promise<{ file: any; canEdit: boolean } | null> {
    const file = await prisma.file.findUnique({
        where: { id: fileId },
        include: {
            user: { select: { id: true, name: true } },
            shares: {
                include: {
                    collaborators: {
                        where: { userId },
                        select: { permission: true },
                    },
                },
            },
        },
    });

    if (!file || file.isTrash) {
        return null;
    }

    const isOwner = file.userId === userId;
    let canEdit = isOwner;

    if (!isOwner) {
        for (const share of file.shares) {
            for (const collab of share.collaborators) {
                if (collab.permission === 'EDITOR') {
                    canEdit = true;
                }
            }
            // If user is not an explicit collaborator, they don't have access
            if (share.collaborators.length === 0) {
                continue;
            }
        }
        // Check if user has any access
        const hasAccess = file.shares.some(s => s.collaborators.length > 0);
        if (!hasAccess) {
            return null;
        }
    }

    return { file, canEdit };
}

/**
 * Generate the host page HTML
 */
function generateHostPageHtml(params: {
    actionUrl: string;
    accessToken: string;
    accessTokenTtl: number;
    fileName: string;
    wopiSrc: string;
    mode: 'view' | 'edit';
}): string {
    const { actionUrl, accessToken, accessTokenTtl, fileName, wopiSrc, mode } = params;

    // Build the full action URL with WOPISrc
    const fullActionUrl = `${actionUrl}${actionUrl.includes('?') ? '&' : '?'}WOPISrc=${encodeURIComponent(wopiSrc)}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fileName)} - CloudBox Office</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; overflow: hidden; }
    body {
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: #f5f6f7;
    }
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #333;
    }
    .loading .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e0e0e0;
      border-top-color: #0066cc;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 16px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .error {
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #cc0000;
      text-align: center;
      padding: 20px;
    }
    .error h2 { margin-bottom: 10px; }
    .error a { color: #0066cc; }
    #office-frame {
      flex: 1;
      width: 100%;
      border: none;
      display: none;
    }
    /* Hidden form for POST submit */
    #wopi-form { display: none; }
  </style>
</head>
<body>
  <div id="loading" class="loading">
    <div class="spinner"></div>
    <p>Opening ${escapeHtml(fileName)}...</p>
  </div>
  
  <div id="error" class="error">
    <h2>Failed to load editor</h2>
    <p id="error-message">An error occurred while loading the document.</p>
    <p><a href="javascript:window.location.reload()">Try again</a> | <a href="/">Go to CloudBox</a></p>
  </div>
  
  <iframe id="office-frame" name="office-frame" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation allow-popups-to-escape-sandbox allow-downloads" allow="autoplay; camera; microphone; display-capture; clipboard-read; clipboard-write"></iframe>
  
  <!-- Form to POST access token to WOPI client -->
  <form id="wopi-form" action="${escapeHtml(fullActionUrl)}" method="POST" target="office-frame">
    <input type="hidden" name="access_token" value="${escapeHtml(accessToken)}">
    <input type="hidden" name="access_token_ttl" value="${accessTokenTtl}">
  </form>
  
  <script>
    (function() {
      var form = document.getElementById('wopi-form');
      var frame = document.getElementById('office-frame');
      var loading = document.getElementById('loading');
      var error = document.getElementById('error');
      var errorMessage = document.getElementById('error-message');
      
      // Timeout for loading
      var loadTimeout = setTimeout(function() {
        showError('The editor is taking too long to load. Please check your network connection.');
      }, 30000);
      
      frame.onload = function() {
        clearTimeout(loadTimeout);
        loading.style.display = 'none';
        frame.style.display = 'block';
      };
      
      frame.onerror = function() {
        clearTimeout(loadTimeout);
        showError('Failed to load the editor. Please try again.');
      };
      
      function showError(message) {
        loading.style.display = 'none';
        error.style.display = 'flex';
        errorMessage.textContent = message;
      }
      
      // Submit the form to load the editor
      try {
        form.submit();
      } catch (e) {
        showError('Failed to initialize the editor: ' + e.message);
      }
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * GET /office/open/:fileId
 * 
 * Renders the host page that opens the file in the WOPI client iframe.
 */
router.get('/open/:fileId', authenticate, async (req: Request, res: Response) => {
    try {
        const { fileId } = req.params;
        const mode = (req.query.mode as string)?.toLowerCase() === 'edit' ? 'edit' : 'view';

        if (!isValidUUID(fileId)) {
            res.status(400).send('Invalid file ID');
            return;
        }

        // Check WOPI is enabled
        if (!config.wopi.enabled) {
            res.status(503).send('Office integration is not enabled');
            return;
        }

        // Check discovery URL is configured
        if (!config.wopi.discoveryUrl) {
            res.status(503).send('Office editor is not configured. Please set WOPI_DISCOVERY_URL.');
            return;
        }

        const userId = req.user!.userId;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, name: true },
        });

        if (!user) {
            res.status(401).send('User not found');
            return;
        }

        const access = await checkFileAccess(fileId, userId);
        if (!access) {
            res.status(404).send('File not found or access denied');
            return;
        }

        const { file, canEdit } = access;

        // Check file extension is supported
        const ext = path.extname(file.name);
        const isSupported = await isExtensionSupported(ext);
        if (!isSupported) {
            res.status(400).send(`File type ${ext} is not supported for online editing`);
            return;
        }

        // Determine actual mode based on permissions
        const actualMode: WopiScope = (mode === 'edit' && canEdit && config.wopi.editEnabled) ? 'edit' : 'view';

        // Get action URL from discovery
        const actionResult = await getActionUrl(ext, actualMode);
        if (!actionResult) {
            res.status(400).send(`No ${actualMode} action available for file type ${ext}`);
            return;
        }

        // Generate WOPI token
        const { token, ttl } = generateWopiToken({
            fileId,
            userId: user.id,
            userEmail: user.email,
            userName: user.name,
            scope: actualMode,
        });

        // Build WOPISrc URL
        const wopiSrc = `${config.wopi.publicUrl}${config.wopi.basePath}/files/${fileId}`;

        // Set CSP headers for iframe
        const allowedOrigins = [...config.wopi.allowedIframeOrigins];

        // Extract origin from action URL
        try {
            const actionOrigin = new URL(actionResult.url).origin;
            if (!allowedOrigins.includes(actionOrigin)) {
                allowedOrigins.push(actionOrigin);
            }
        } catch {
            // Invalid URL, continue without adding
        }

        // Add self
        allowedOrigins.push("'self'");

        res.setHeader(
            'Content-Security-Policy',
            `frame-ancestors ${allowedOrigins.join(' ')}`
        );

        // Generate and send host page
        const html = generateHostPageHtml({
            actionUrl: actionResult.url,
            accessToken: token,
            accessTokenTtl: ttl,
            fileName: file.name,
            wopiSrc,
            mode: actualMode,
        });

        res.type('html').send(html);
    } catch (error) {
        logger.error('Office open error', { fileId: req.params.fileId }, error instanceof Error ? error : undefined);
        res.status(500).send('Failed to open file. Please try again later.');
    }
});

/**
 * GET /office/supported
 * 
 * Returns list of supported file extensions for WOPI editing.
 */
router.get('/supported', async (req: Request, res: Response) => {
    try {
        if (!config.wopi.enabled) {
            res.json({ enabled: false, extensions: [] });
            return;
        }

        const { getSupportedExtensions } = await import('../lib/wopi/discovery.js');
        const extensions = await getSupportedExtensions();

        res.json({
            enabled: true,
            editEnabled: config.wopi.editEnabled,
            extensions,
        });
    } catch (error) {
        logger.error('Get supported extensions error', {}, error instanceof Error ? error : undefined);
        res.json({ enabled: false, extensions: [], error: 'Failed to fetch supported extensions' });
    }
});

export default router;
