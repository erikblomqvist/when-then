// Keeps the phone's screen on with Screen Wake Lock, so a game doesn't keep dropping to a locked
// screen. The browser lets go of the lock whenever the page is hidden, so it's asked for again
// each time the page becomes visible.

/**
 * Holds a Screen Wake Lock until the returned function is called, asking again whenever the
 * page becomes visible. Without Wake Lock support, or when the browser refuses (low battery,
 * a page not yet visible), the screen simply sleeps as usual.
 */
export function holdWakeLock(): () => void {
    if (!('wakeLock' in navigator)) return () => {}
    let lock: WakeLockSentinel | undefined
    let held = true
    let requesting = false

    async function request() {
        if (document.visibilityState !== 'visible' || requesting || (lock && !lock.released)) return
        requesting = true
        try {
            const next = await navigator.wakeLock.request('screen')
            if (held) lock = next
            else void next.release()
        } catch {
            // Refused: nothing to hold until the page is visible again.
        } finally {
            requesting = false
        }
    }
    const onVisible = () => void request()

    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
        held = false
        document.removeEventListener('visibilitychange', onVisible)
        void lock?.release()
    }
}
