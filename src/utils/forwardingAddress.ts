/**
 * Inserts a "+token" subaddress tag before the "@" in an email address, e.g.
 * ("inbox@pipedream.net", "ab12cd34ef56") -> "inbox+ab12cd34ef56@pipedream.net".
 * Returns null if `base` isn't a plausible email address (e.g. unconfigured).
 */
export function buildForwardingAddress(base: string | undefined, token: string): string | null {
  if (!base) return null;
  const atIndex = base.indexOf("@");
  if (atIndex <= 0) return null;
  return `${base.slice(0, atIndex)}+${token}${base.slice(atIndex)}`;
}
