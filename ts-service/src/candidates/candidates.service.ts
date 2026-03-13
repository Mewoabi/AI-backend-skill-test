import { randomUUID } from 'crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuthUser } from '../auth/auth.types';
import { CandidateDocument } from '../entities/candidate-document.entity';
import { CandidateSummary } from '../entities/candidate-summary.entity';
import { SampleCandidate } from '../entities/sample-candidate.entity';
import { QueueService } from '../queue/queue.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

/** Constant used to track which prompt template version produced a summary. */
export const CURRENT_PROMPT_VERSION = '1.0';

/**
 * Service for candidate document intake and summary management.
 *
 * All methods begin with an access-control check via `verifyCandidateAccess`
 * to ensure the requesting workspace can only interact with its own candidates.
 */
@Injectable()
export class CandidatesService {
  constructor(
    @InjectRepository(SampleCandidate)
    private readonly candidateRepository: Repository<SampleCandidate>,

    @InjectRepository(CandidateDocument)
    private readonly documentRepository: Repository<CandidateDocument>,

    @InjectRepository(CandidateSummary)
    private readonly summaryRepository: Repository<CandidateSummary>,

    private readonly queueService: QueueService,
  ) {}

  // ------------------------------------------------------------------
  // Access control
  // ------------------------------------------------------------------

  /**
   * Verify that the candidate exists and belongs to the caller's workspace.
   *
   * This is the single access-control gate used by every method in this
   * service, ensuring a recruiter can never read or mutate data that belongs
   * to a different workspace.
   *
   * @throws NotFoundException when the candidate is not found in the workspace.
   */
  async verifyCandidateAccess(
    candidateId: string,
    workspaceId: string,
  ): Promise<SampleCandidate> {
    const candidate = await this.candidateRepository.findOne({
      where: { id: candidateId, workspaceId },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found in this workspace');
    }

    return candidate;
  }

  // ------------------------------------------------------------------
  // Documents
  // ------------------------------------------------------------------

  /**
   * Store a candidate document after verifying workspace access.
   *
   * The storageKey defaults to a deterministic path pattern:
   *   documents/{candidateId}/{uuid}-{fileName}
   */
  async uploadDocument(
    user: AuthUser,
    candidateId: string,
    dto: UploadDocumentDto,
  ): Promise<CandidateDocument> {
    await this.verifyCandidateAccess(candidateId, user.workspaceId);

    const id = randomUUID();
    const storageKey =
      dto.storageKey ?? `documents/${candidateId}/${randomUUID()}-${dto.fileName}`;

    const document = this.documentRepository.create({
      id,
      candidateId,
      documentType: dto.documentType,
      fileName: dto.fileName,
      storageKey,
      rawText: dto.rawText,
    });

    return this.documentRepository.save(document);
  }

  /**
   * List all documents uploaded for a candidate.
   * Ordered by uploadedAt descending (most recent first).
   */
  async listDocuments(user: AuthUser, candidateId: string): Promise<CandidateDocument[]> {
    await this.verifyCandidateAccess(candidateId, user.workspaceId);

    return this.documentRepository.find({
      where: { candidateId },
      order: { uploadedAt: 'DESC' },
    });
  }

  // ------------------------------------------------------------------
  // Summaries
  // ------------------------------------------------------------------

  /**
   * Create a pending summary record and enqueue the background generation job.
   *
   * Returns immediately with a 'pending' summary — the caller should poll
   * GET /candidates/:id/summaries/:summaryId to track completion.
   *
   * If a pending summary already exists for this candidate, returns it instead
   * of creating a duplicate job.
   */
  async requestSummaryGeneration(
    user: AuthUser,
    candidateId: string,
  ): Promise<CandidateSummary> {
    await this.verifyCandidateAccess(candidateId, user.workspaceId);

    // Guard: avoid double-queuing if a pending job already exists
    const existing = await this.summaryRepository.findOne({
      where: { candidateId, status: 'pending' },
    });
    if (existing) {
      return existing;
    }

    const summary = this.summaryRepository.create({
      id: randomUUID(),
      candidateId,
      status: 'pending',
    });

    await this.summaryRepository.save(summary);

    // Enqueue asynchronous processing — the worker resolves this independently
    this.queueService.enqueue('summary-generation', {
      summaryId: summary.id,
      candidateId,
    });

    return summary;
  }

  /**
   * Return all summaries for a candidate, newest first.
   */
  async listSummaries(user: AuthUser, candidateId: string): Promise<CandidateSummary[]> {
    await this.verifyCandidateAccess(candidateId, user.workspaceId);

    return this.summaryRepository.find({
      where: { candidateId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Retrieve a single summary by id, scoped to the candidate and workspace.
   *
   * @throws NotFoundException when the summary does not exist or belongs to a
   *   different candidate.
   */
  async getSummary(
    user: AuthUser,
    candidateId: string,
    summaryId: string,
  ): Promise<CandidateSummary> {
    await this.verifyCandidateAccess(candidateId, user.workspaceId);

    const summary = await this.summaryRepository.findOne({
      where: { id: summaryId, candidateId },
    });

    if (!summary) {
      throw new NotFoundException('Summary not found');
    }

    return summary;
  }
}
