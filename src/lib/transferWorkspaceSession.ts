export const transferWorkspacePrefix = 'drac-transfer-workspace:v1:';

export function readTransferWorkspace<T>(key: string): T | null {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') as T | null; }
  catch { return null; }
}

export function writeTransferWorkspace(key: string, snapshot: unknown): void {
  try { sessionStorage.setItem(key, JSON.stringify(snapshot)); }
  catch { /* Keep the current form usable when storage is unavailable. */ }
}

export function clearTransferWorkspaces(): void {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(transferWorkspacePrefix)) sessionStorage.removeItem(key);
    }
  } catch { /* Storage may be unavailable. */ }
}
