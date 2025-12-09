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
        // Coverage configuration
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            reportsDirectory: './coverage',
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.test.ts',
                'src/**/__tests__/**',
                'src/types/**',
                'node_modules/**',
            ],
            // Thresholds (optional - can be enabled later)
            // thresholds: {
            //     lines: 50,
            //     functions: 50,
            //     branches: 50,
            //     statements: 50,
            // },
        },
    },
});
