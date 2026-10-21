import type { StorybookConfig } from '@storybook/sveltekit';

const config: StorybookConfig = {
	stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|ts|svelte)'],
	// Svelte CSF (defineMeta) is built into @storybook/sveltekit since Storybook 11.
	addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
	framework: { name: '@storybook/sveltekit', options: {} }
};

export default config;
