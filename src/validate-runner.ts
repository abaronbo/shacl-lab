// Security #2: enforces "one run in flight, at most one queued per request
// kind" and the hard 10s wall-clock cap from the UI thread (worker.terminate()
// on breach).
import type { InferenceResult, ValidateRequest } from './worker';
import { RunError, type WorkerClient } from './worker-client';

export type RunJob<R> = {
  request: Omit<ValidateRequest, 'id'>;
  onResult: (result: R) => void;
  onError: (message: string, inference?: InferenceResult) => void;
  onTimeout: () => void;
};

const HARD_CAP_MS = 10_000;

export class ValidateRunner {
  private inFlight = false;
  private queued: RunJob<any>[] = [];
  private generation = 0;

  private readonly client: WorkerClient;

  constructor(client: WorkerClient) {
    this.client = client;
  }

  run<R>(job: RunJob<R>): void {
    if (this.inFlight) {
      const i = this.queued.findIndex((q) => q.request.type === job.request.type);
      if (i >= 0) this.queued[i] = job;
      else this.queued.push(job);
      return;
    }
    void this.start(job);
  }

  private async start<R>(job: RunJob<R>): Promise<void> {
    this.inFlight = true;
    const gen = ++this.generation;

    try {
      await this.client.awaitReady();
    } catch (err) {
      if (gen !== this.generation) return;
      this.finish();
      job.onError(String(err));
      return;
    }
    if (gen !== this.generation) return;

    const timeoutHandle = window.setTimeout(() => {
      if (gen !== this.generation) return;
      this.client.terminate('validation exceeded the time limit and was stopped');
      this.generation++;
      this.inFlight = false;
      const next = this.queued.shift();
      job.onTimeout();
      if (next) this.run(next);
    }, HARD_CAP_MS);

    this.client
      .send<{ type: 'result'; result: R }>(job.request)
      .then((res) => {
        if (gen !== this.generation) return;
        window.clearTimeout(timeoutHandle);
        this.finish();
        job.onResult(res.result);
      })
      .catch((err) => {
        if (gen !== this.generation) return;
        window.clearTimeout(timeoutHandle);
        this.finish();
        job.onError(String(err), err instanceof RunError ? err.inference : undefined);
      });
  }

  private finish(): void {
    this.inFlight = false;
    const next = this.queued.shift();
    if (next) this.run(next);
  }
}
