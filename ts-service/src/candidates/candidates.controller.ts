import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/auth-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { FakeAuthGuard } from '../auth/fake-auth.guard';
import { CandidateDocument } from '../entities/candidate-document.entity';
import { CandidateSummary } from '../entities/candidate-summary.entity';
import { CandidatesService } from './candidates.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

/**
 * Handles all candidate-scoped operations: document intake and summary
 * generation / retrieval.
 *
 * Every endpoint requires the `x-user-id` and `x-workspace-id` headers
 * (enforced by FakeAuthGuard), and the service layer verifies that the
 * requested candidate belongs to the caller's workspace before any action
 * is taken.
 */
@ApiTags('candidates')
@ApiSecurity('x-user-id')
@ApiSecurity('x-workspace-id')
@Controller('candidates')
@UseGuards(FakeAuthGuard)
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  // ------------------------------------------------------------------
  // Documents
  // ------------------------------------------------------------------

  /**
   * POST /candidates/:candidateId/documents
   *
   * Upload a document (resume, cover letter, etc.) for a candidate.
   * Returns the persisted document record with its generated id and storageKey.
   */
  @Post(':candidateId/documents')
  @HttpCode(HttpStatus.CREATED)
  async uploadDocument(
    @CurrentUser() user: AuthUser,
    @Param('candidateId') candidateId: string,
    @Body() dto: UploadDocumentDto,
  ): Promise<CandidateDocument> {
    return this.candidatesService.uploadDocument(user, candidateId, dto);
  }

  /**
   * GET /candidates/:candidateId/documents
   *
   * List all documents uploaded for a candidate, newest first.
   */
  @Get(':candidateId/documents')
  async listDocuments(
    @CurrentUser() user: AuthUser,
    @Param('candidateId') candidateId: string,
  ): Promise<CandidateDocument[]> {
    return this.candidatesService.listDocuments(user, candidateId);
  }

  // ------------------------------------------------------------------
  // Summaries
  // ------------------------------------------------------------------

  /**
   * POST /candidates/:candidateId/summaries/generate
   *
   * Queue an asynchronous LLM summary generation job for a candidate.
   * Returns 202 Accepted with the newly created (status: 'pending') summary.
   * The summary transitions to 'completed' or 'failed' once the worker runs.
   */
  @Post(':candidateId/summaries/generate')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestSummaryGeneration(
    @CurrentUser() user: AuthUser,
    @Param('candidateId') candidateId: string,
  ): Promise<CandidateSummary> {
    return this.candidatesService.requestSummaryGeneration(user, candidateId);
  }

  /**
   * GET /candidates/:candidateId/summaries
   *
   * List all summaries for a candidate, newest first.
   */
  @Get(':candidateId/summaries')
  async listSummaries(
    @CurrentUser() user: AuthUser,
    @Param('candidateId') candidateId: string,
  ): Promise<CandidateSummary[]> {
    return this.candidatesService.listSummaries(user, candidateId);
  }

  /**
   * GET /candidates/:candidateId/summaries/:summaryId
   *
   * Retrieve a single summary by its id.
   */
  @Get(':candidateId/summaries/:summaryId')
  async getSummary(
    @CurrentUser() user: AuthUser,
    @Param('candidateId') candidateId: string,
    @Param('summaryId') summaryId: string,
  ): Promise<CandidateSummary> {
    return this.candidatesService.getSummary(user, candidateId, summaryId);
  }
}
