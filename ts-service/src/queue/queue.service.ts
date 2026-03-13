import { randomUUID } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';

export interface EnqueuedJob<TPayload = unknown> {
  id: string;
  name: string;
  payload: TPayload;
  enqueuedAt: string;
}

/**
 * Simple in-memory job queue with synchronous processor registration.
 *
 * When a processor is registered for a job name via `registerProcessor`,
 * jobs of that name are dispatched asynchronously via `setImmediate` after
 * being pushed to the queue.  This keeps enqueue() non-blocking while
 * ensuring the processor runs in the same event loop (no external broker
 * required).
 *
 * Note: because this queue is in-memory, pending jobs are lost on process
 * restart.  For production use, replace with BullMQ + Redis.
 */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly jobs: EnqueuedJob[] = [];

  /** Registered handlers keyed by job name. */
  private readonly processors = new Map<string, (payload: unknown) => Promise<void>>();

  /**
   * Register an async handler for jobs with the given name.
   * Only one processor per job name is supported.
   */
  registerProcessor(name: string, handler: (payload: unknown) => Promise<void>): void {
    this.processors.set(name, handler);
  }

  /**
   * Add a job to the queue and, if a processor is registered, schedule it
   * to run after the current event loop tick (`setImmediate`).
   */
  enqueue<TPayload>(name: string, payload: TPayload): EnqueuedJob<TPayload> {
    const job: EnqueuedJob<TPayload> = {
      id: randomUUID(),
      name,
      payload,
      enqueuedAt: new Date().toISOString(),
    };

    this.jobs.push(job);

    // Dispatch to registered processor asynchronously so the caller's
    // request is not blocked by the processing work.
    const processor = this.processors.get(name);
    if (processor) {
      setImmediate(() => {
        processor(payload).catch((err: unknown) => {
          this.logger.error(`Job ${job.id} (${name}) failed: ${String(err)}`);
        });
      });
    }

    return job;
  }

  /** Return a snapshot of all enqueued jobs (for inspection/testing). */
  getQueuedJobs(): readonly EnqueuedJob[] {
    return this.jobs;
  }
}
