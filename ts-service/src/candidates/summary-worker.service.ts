import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CandidateDocument } from '../entities/candidate-document.entity';
import { CandidateSummary } from '../entities/candidate-summary.entity';
import {
  CandidateSummaryResult,
  SUMMARIZATION_PROVIDER,
  SummarizationProvider,
} from '../llm/summarization-provider.interface';
import { QueueService } from '../queue/queue.service';
import { CURRENT_PROMPT_VERSION } from './candidates.service';

/** Shape of the payload enqueued by CandidatesService.requestSummaryGeneration. */
interface SummaryJobPayload {
  summaryId: string;
  candidateId: string;
}

/**
 * Background worker that consumes 'summary-generation' jobs from the queue.
 *
 * Lifecycle:
 *   1. On module init, registers itself as the processor for 'summary-generation'.
 *   2. For each job:
 *      a. Loads the pending summary and all candidate documents.
 *      b. Calls the injected SummarizationProvider (Gemini in prod, Fake in tests).
 *      c. Validates the structured LLM output.
 *      d. Saves the result with status='completed', or captures the error with
 *         status='failed'.
 *
 * The worker deliberately never throws — all errors are caught, logged, and
 * recorded on the summary record so callers can inspect the errorMessage field.
 */
@Injectable()
export class SummaryWorkerService implements OnModuleInit {
  private readonly logger = new Logger(SummaryWorkerService.name);

  constructor(
    @InjectRepository(CandidateSummary)
    private readonly summaryRepository: Repository<CandidateSummary>,

    @InjectRepository(CandidateDocument)
    private readonly documentRepository: Repository<CandidateDocument>,

    private readonly queueService: QueueService,

    @Inject(SUMMARIZATION_PROVIDER)
    private readonly provider: SummarizationProvider,
  ) {}

  /** Register the processor once the NestJS dependency graph is fully resolved. */
  onModuleInit(): void {
    this.queueService.registerProcessor(
      'summary-generation',
      (payload) => this.processSummaryJob(payload as SummaryJobPayload),
    );
    this.logger.log('Registered processor for summary-generation jobs');
  }

  // ------------------------------------------------------------------
  // Job handler
  // ------------------------------------------------------------------

  /**
   * Process a single summary-generation job end-to-end.
   *
   * Designed to be idempotent: if the summary has already left 'pending'
   * state (e.g. due to a duplicate enqueue), the method exits early.
   */
  async processSummaryJob(payload: SummaryJobPayload): Promise<void> {
    const { summaryId, candidateId } = payload;

    // 1. Load the summary record
    const summary = await this.summaryRepository.findOne({ where: { id: summaryId } });

    if (!summary) {
      this.logger.warn(`Summary ${summaryId} not found; skipping job`);
      return;
    }

    // 2. Idempotency guard — skip if already processed
    if (summary.status !== 'pending') {
      this.logger.log(`Summary ${summaryId} is already ${summary.status}; skipping`);
      return;
    }

    // 3. Load all candidate documents to use as LLM context
    const documents = await this.documentRepository.find({ where: { candidateId } });

    try {
      // 4. Call the summarization provider
      const result = await this.provider.generateCandidateSummary({
        candidateId,
        documents: documents.map((d) => d.rawText),
      });

      // 5. Validate the structured output before persisting
      validateSummaryResult(result);

      // 6. Persist the successful result
      summary.status = 'completed';
      summary.score = result.score;
      summary.strengths = result.strengths;
      summary.concerns = result.concerns;
      summary.summary = result.summary;
      summary.recommendedDecision = result.recommendedDecision;
      summary.provider = this.provider.constructor.name;
      summary.promptVersion = CURRENT_PROMPT_VERSION;
      summary.errorMessage = null;

      this.logger.log(`Summary ${summaryId} completed (score: ${result.score})`);
    } catch (err: unknown) {
      // 7. Record the failure without rethrowing
      const message = err instanceof Error ? err.message : String(err);
      summary.status = 'failed';
      summary.errorMessage = message;
      this.logger.error(`Summary ${summaryId} failed: ${message}`);
    }

    await this.summaryRepository.save(summary);
  }
}

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

/**
 * Validate that the LLM's response conforms to the expected CandidateSummaryResult shape.
 *
 * Throws a descriptive Error if any field is missing or has the wrong type.
 * This prevents malformed LLM output from being silently stored.
 */
export function validateSummaryResult(raw: CandidateSummaryResult): void {
  if (typeof raw.score !== 'number' || isNaN(raw.score)) {
    throw new Error('LLM response: "score" must be a number');
  }
  if (!Array.isArray(raw.strengths) || !raw.strengths.every((s) => typeof s === 'string')) {
    throw new Error('LLM response: "strengths" must be an array of strings');
  }
  if (!Array.isArray(raw.concerns) || !raw.concerns.every((c) => typeof c === 'string')) {
    throw new Error('LLM response: "concerns" must be an array of strings');
  }
  if (typeof raw.summary !== 'string' || !raw.summary.trim()) {
    throw new Error('LLM response: "summary" must be a non-empty string');
  }
  const validDecisions = ['advance', 'hold', 'reject'] as const;
  if (!validDecisions.includes(raw.recommendedDecision)) {
    throw new Error(
      `LLM response: "recommendedDecision" must be one of ${validDecisions.join(', ')}`,
    );
  }
}
