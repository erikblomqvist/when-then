<script lang="ts">
    import AdminHome from '#lib/admin/home/AdminHome.svelte'
    import type { PageProps } from './$types'

    let { data }: PageProps = $props()
</script>

<svelte:head>
    <title>Admin · When Then?</title>
</svelte:head>

<AdminHome
    home={data.home}
    role={data.role} />
