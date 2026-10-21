import adapter from '@sveltejs/adapter-vercel'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig, lazyPlugins } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

export default defineConfig({
    staged: {
        '*': 'vp check --fix',
    },
    fmt: {
        tabWidth: 4,
        singleQuote: true,
        semi: false,
        printWidth: 100,
        singleAttributePerLine: true,
        bracketSameLine: true,
        svelte: {
            sortOrder: 'options-scripts-markup-styles',
        },
        // Docs are hand-formatted prose, and trailing double spaces there are deliberate line breaks.
        ignorePatterns: ['**/*.md'],
    },
    lint: {
        jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
        rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
        options: { typeAware: true, typeCheck: true },
    },
    plugins: lazyPlugins(() => [
        sveltekit({
            compilerOptions: {
                // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
                runes: ({ filename }) =>
                    filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
                warningFilter: (warning) => warning.code !== 'element_invalid_self_closing_tag',
                // `await` in components + hydratable. Experimental until Svelte 6:
                // https://svelte.dev/docs/svelte/await-expressions
                experimental: { async: true },
            },
            adapter: adapter(),
        }),
    ]),
    test: {
        expect: { requireAssertions: true },
        // Until game logic lands, the server project has no tests.
        passWithNoTests: true,
        projects: [
            {
                extends: './vite.config.ts',
                test: {
                    name: 'client',
                    browser: {
                        enabled: true,
                        provider: playwright(),
                        instances: [{ browser: 'chromium', headless: true }],
                    },
                    include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
                    exclude: ['src/lib/server/**'],
                },
            },
            {
                extends: './vite.config.ts',
                test: {
                    name: 'server',
                    environment: 'node',
                    include: ['src/**/*.{test,spec}.{js,ts}'],
                    exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
                },
            },
        ],
    },
})
