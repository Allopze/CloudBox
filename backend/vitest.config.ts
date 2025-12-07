import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts'],
        exclude: ['node_modules', 'dist'],
        testTimeout: 30000,
        hookTimeout: 30000,
        // Separate unit and integration tests
        // Unit tests run by default, integration tests need --run flag
        typecheck: {
            enabled: false, // Disable typecheck during tests for speed
        },
    },
});
