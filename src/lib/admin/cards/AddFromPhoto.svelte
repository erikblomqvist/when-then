<!--
    The way into "Add from photo" (#60). A link to the photo page; on a touch screen it opens the
    camera instead, and the photo page opens with the photo taken, ready to read.
-->
<script lang="ts">
    import { onMount, type Snippet } from 'svelte'
    import { goto } from '$app/navigation'
    import { handOverPhotos, usesCamera } from './photo-handoff.js'

    type Props = { class?: string; children: Snippet }

    let { class: className, children }: Props = $props()

    let camera = $state(false)
    onMount(() => {
        camera = usesCamera()
    })

    async function taken(event: Event & { currentTarget: HTMLInputElement }) {
        const files = [...(event.currentTarget.files ?? [])]
        event.currentTarget.value = ''
        if (files.length === 0) return
        handOverPhotos(files)
        await goto('/admin/cards/photo')
    }
</script>

{#if camera}
    <!-- A label, not a button: a file input can't sit inside a button. -->
    <label class={[className, 'cursor-pointer']}>
        {@render children()}
        <input
            type="file"
            accept="image/*"
            capture="environment"
            class="sr-only"
            onchange={taken} />
    </label>
{:else}
    <a
        href="/admin/cards/photo"
        class={className}>
        {@render children()}
    </a>
{/if}
