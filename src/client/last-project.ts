// Remembers the Project you last worked in, per Workspace, so opening the app takes you back to it.
const storageKey = (slug: string) => `pm:last-project:${slug}`;

export function getLastProject(slug: string): string | null {
  try {
    return localStorage.getItem(storageKey(slug));
  } catch {
    return null;
  }
}

export function setLastProject(slug: string, key: string | null) {
  try {
    if (key) localStorage.setItem(storageKey(slug), key);
    else localStorage.removeItem(storageKey(slug));
  } catch {
    // Storage can be unavailable (private mode); remembering is best effort.
  }
}
