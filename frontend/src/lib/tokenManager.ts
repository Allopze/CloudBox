/**
 * ============================================================================
 * Token Manager - In-Memory Token Storage
 * ============================================================================
 * 
 * SECURITY FIX P0-1: This module stores the access token in memory instead of
 * localStorage to prevent XSS attacks from stealing the token.
 * 
 * How it works:
 * - Access token is stored in a closure variable (not accessible from window)
 * - On page refresh, the token is lost, but the refresh token (httpOnly cookie)
 *   is used to obtain a new access token automatically
 * - This is more secure than localStorage because:
 *   1. XSS cannot read the token from window/localStorage
 *   2. The token is not persisted to disk
 *   3. Closing the tab clears the token
 * 
 * Trade-offs:
 * - User needs to re-authenticate on page refresh (handled by silent refresh)
 * - Multiple tabs don't share the token (each gets its own via refresh)
 * ============================================================================
 */

// Private variable - not accessible from outside this module
let accessToken: string | null = null;

/**
 * Get the current access token
 */
export const getAccessToken = (): string | null => {
    return accessToken;
};

/**
 * Set the access token (called after login/refresh)
 */
export const setAccessToken = (token: string | null): void => {
    accessToken = token;
};

/**
 * Clear the access token (called on logout)
 */
export const clearAccessToken = (): void => {
    accessToken = null;
};

/**
 * Check if we have an access token
 */
export const hasAccessToken = (): boolean => {
    return accessToken !== null;
};

/**
 * Migration helper: Move token from localStorage to memory (one-time migration)
 * Called on app initialization to migrate existing sessions
 */
export const migrateFromLocalStorage = (): void => {
    const storedToken = localStorage.getItem('accessToken');
    if (storedToken) {
        accessToken = storedToken;
        // Remove from localStorage after migration
        localStorage.removeItem('accessToken');
        console.info('[Security] Migrated access token from localStorage to memory');
    }
};
