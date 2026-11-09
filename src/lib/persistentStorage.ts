/** Ask the browser not to auto-evict this origin's IndexedDB under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isStoragePersistent(): Promise<boolean | undefined> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return undefined;
  try {
    return await navigator.storage.persisted();
  } catch {
    return undefined;
  }
}
