// Thin wrapper around the validation Worker: spawns lazily, resolves requests
// by id, and lets the caller force a terminate + respawn-on-next-use (used
// by the hard wall-clock cap in main.ts — Security #2).
import type { ParseRequest, ValidateRequest } from './worker';

type Pending = { resolve: (value: any) => void; reject: (reason: unknown) => void };

export class WorkerClient {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private readonly onReadyChange: (ready: boolean) => void;
  private readonly onBootError: (message: string) => void;

  constructor(onReadyChange: (ready: boolean) => void, onBootError: (message: string) => void) {
    this.onReadyChange = onReadyChange;
    this.onBootError = onBootError;
  }

  private spawn(): void {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    this.onReadyChange(false);
    this.ready = new Promise((resolve, reject) => {
      const onFirstMessage = (ev: MessageEvent) => {
        if (ev.data?.type === 'ready') {
          worker.removeEventListener('message', onFirstMessage);
          this.onReadyChange(true);
          resolve();
        } else if (ev.data?.type === 'boot-error') {
          worker.removeEventListener('message', onFirstMessage);
          this.onBootError(String(ev.data.error));
          reject(new Error(String(ev.data.error)));
        }
      };
      worker.addEventListener('message', onFirstMessage);
    });
    worker.addEventListener('message', (ev) => this.handleMessage(ev));
  }

  private handleMessage(ev: MessageEvent): void {
    const data = ev.data;
    if (data?.type === 'ready' || data?.type === 'boot-error') return;
    const entry = this.pending.get(data.id);
    if (!entry) return;
    this.pending.delete(data.id);
    if (data.type === 'error') entry.reject(new Error(data.error));
    else entry.resolve(data);
  }

  awaitReady(): Promise<void> {
    if (!this.worker) this.spawn();
    return this.ready!;
  }

  async send<T>(msg: Omit<ValidateRequest, 'id'> | Omit<ParseRequest, 'id'>): Promise<T> {
    await this.awaitReady();
    const id = this.nextId++;
    const worker = this.worker!;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...msg, id });
    });
  }

  terminate(reason: string): void {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    this.ready = null;
    for (const entry of this.pending.values()) entry.reject(new Error(reason));
    this.pending.clear();
    this.onReadyChange(false);
  }
}
