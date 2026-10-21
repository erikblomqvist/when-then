/// <reference types="vite/client" />
import type { Preview } from '@storybook/sveltekit';
import SurfaceDecorator from './SurfaceDecorator.svelte';
import '../src/lib/styles/tokens.css';
import '../src/lib/styles/components.css';

const preview: Preview = {
	parameters: {
		layout: 'fullscreen',
		// Which surface a story sits on: 'table' (dark navy), 'paper' (cream sheet) or 'none'.
		surface: 'table',
		controls: { matchers: { color: /(background|color)$/i } },
		a11y: { test: 'todo' }
	},
	decorators: [
		(_story, ctx) => ({
			Component: SurfaceDecorator,
			props: { surface: ctx.parameters.surface }
		})
	]
};

export default preview;
