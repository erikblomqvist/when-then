<script module lang="ts">
	import { defineMeta } from '@storybook/sveltekit';
	import Text from './Text.svelte';

	const { Story } = defineMeta({
		title: 'Foundations/Typography',
		component: Text,
		tags: ['autodocs']
	});
</script>

<!-- Fraunces for display, headings, card text and years; Bricolage Grotesque for UI text. -->
<Story name="Roles">
	<div style="display: grid; gap: 20px;">
		<Text role="display" class="ui-paper" style="display:inline-block">1989</Text>
		<Text role="heading-1">When Then?</Text>
		<Text role="heading-2" style="color: var(--text-on-table)">Choose game settings</Text>
		<Text role="body">Body text on the table, in Bricolage Grotesque.</Text>
		<Text role="label">Label</Text>
		<Text role="caption" style="color: var(--text-on-table-muted)">Caption</Text>
		<Text role="error">That play code doesn't exist.</Text>
	</div>
</Story>
