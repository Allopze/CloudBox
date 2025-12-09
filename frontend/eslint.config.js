import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist', 'node_modules'] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            // React Hooks
            ...reactHooks.configs.recommended.rules,

            // React Refresh
            'react-refresh/only-export-components': [
                'warn',
                { allowConstantExport: true },
            ],

            // TypeScript
            '@typescript-eslint/no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'off',

            // Relaxed rules for existing codebase
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            'no-console': 'off', // Allow console for now
            'prefer-const': 'warn',
        },
    },
);
