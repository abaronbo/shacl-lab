// Security #2: enforces "one run in flight, at most one queued" and the hard
// 10s wall-clock cap from the UI thread (worker.terminate() on breach).
import type { ValidationResult, ValidateRequest } from './worker';
import type { WorkerClient } from './worker-client';

export type ValidateJob = {
  request: Omit<ValidateRequest, 'id' | 'type'>;
  onResult: (result: ValidationResult) => void;
  onError: (message: string) => void;
  onTimeout: () => void;
};

const HARD_CAP_MS = 10_000;

export class ValidateRunner {
  private inFlight = false;
  private queued: ValidateJob | null = null;
  private generation = 0;

  private readonly client: WorkerClient;

  constructor(client: WorkerClient) {
    this.client = client;
  }

  run(job: ValidateJob): void {
    if (this.inFlight) {
      this.queued = job;
      return;
    }
    void this.start(job);
  }

  private async start(job: ValidateJob): Promise<void> {
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
      const next = this.queued;
      this.queued = null;
      job.onTimeout();
      if (next) this.run(next);
    }, HARD_CAP_MS);

    this.client
      .send<{ type: 'result'; result: ValidationResult }>({ type: 'validate', ...job.request })
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
        job.onError(String(err));
      });
  }

  private finish(): void {
    this.inFlight = false;
    const next = this.queued;
    this.queued = null;
    if (next) this.run(next);
  }
}
