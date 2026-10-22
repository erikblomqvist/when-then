<script lang="ts">
    import { qrPath } from './qr-path'

    /** A QR code for `value`, drawn as one SVG path on a white tile. `label` names it for screen readers. */
    let { value, label, size = 200 }: { value: string; label: string; size?: number } = $props()

    const qr = $derived(qrPath(value))
</script>

<svg
    class="qr"
    role="img"
    aria-label={label}
    width={size}
    height={size}
    viewBox="0 0 {qr.size} {qr.size}"
    shape-rendering="crispEdges">
    <rect
        width={qr.size}
        height={qr.size}
        fill="white" />
    <path
        d={qr.path}
        fill="black" />
</svg>

<style>
    .qr {
        display: block;
        border-radius: var(--radius-md);
    }
</style>
