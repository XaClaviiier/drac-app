export type SystemProcessStatus = 'running' | 'success' | 'error';

export interface SystemProcess {
  id: string;
  label: string;
  status: SystemProcessStatus;
  progress?: number;
  message?: string;
  startedAt: string;
  finishedAt?: string;
}

export const PROCESS_QUEUE_EVENT = 'drac:process-queue';
const STORAGE_KEY = 'drac-process-queue';

export function readProcessQueue(): SystemProcess[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function writeProcessQueue(tasks: SystemProcess[]) {
  const next = tasks.slice(0, 20);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(PROCESS_QUEUE_EVENT, { detail: next }));
}

export function startSystemProcess(label: string, message?: string) {
  const task: SystemProcess = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    status: 'running',
    progress: 0,
    message,
    startedAt: new Date().toISOString(),
  };
  writeProcessQueue([task, ...readProcessQueue()]);
  return task.id;
}

export function updateSystemProcess(id: string, progress: number, message?: string) {
  writeProcessQueue(readProcessQueue().map(task => task.id === id
    ? { ...task, progress: Math.max(0, Math.min(100, Math.round(progress))), message: message ?? task.message }
    : task));
}

export function finishSystemProcess(id: string, message?: string) {
  writeProcessQueue(readProcessQueue().map(task => task.id === id
    ? { ...task, status: 'success', progress: 100, message: message ?? task.message, finishedAt: new Date().toISOString() }
    : task));
}

export function failSystemProcess(id: string, message?: string) {
  writeProcessQueue(readProcessQueue().map(task => task.id === id
    ? { ...task, status: 'error', message: message ?? task.message, finishedAt: new Date().toISOString() }
    : task));
}

export function clearFinishedSystemProcesses() {
  writeProcessQueue(readProcessQueue().filter(task => task.status === 'running'));
}
