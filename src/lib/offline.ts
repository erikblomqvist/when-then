/**
 * Whether the service worker answers requests for this path at all. The admin is left to
 * the network: its pages depend on who is signed in, so a cached copy could show one
 * person's admin to the next, or a signed-out page after signing in.
 */
export const serviceWorkerHandles = (pathname: string) => !/^\/admin(?:\/|$)/.test(pathname)
