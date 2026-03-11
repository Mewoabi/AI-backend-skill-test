import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CandidateDocument } from '../entities/candidate-document.entity';
import { CandidateSummary } from '../entities/candidate-summary.entity';
import { FakeSummarizationProvider } from '../llm/fake-summarization.provider';
import { SUMMARIZATION_PROVIDER } from '../llm/summarization-provider.interface';
import { QueueService } from '../queue/queue.service';
import { SummaryWorkerService, validateSummaryResult } from './summary-worker.service';

describe('SummaryWorkerService', () => {
  let service: SummaryWorkerService;
  let fakeProvider: FakeSummarizationProvider;

  // -----------------------------------------------------------------------
  // Mock repositories
  // -----------------------------------------------------------------------

  const summaryRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const documentRepository = {
    find: jest.fn(),
  };

  const queueService = {
    registerProcessor: jest.fn(),
  };

  // -----------------------------------------------------------------------
  // Setup
  // -----------------------------------------------------------------------

  beforeEach(async () => {
    jest.clearAllMocks();

    fakeProvider = new FakeSummarizationProvider();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SummaryWorkerService,
        { provide: getRepositoryToken(CandidateSummary), useValue: summaryRepository },
        { provide: getRepositoryToken(CandidateDocument), useValue: documentRepository },
        { provide: QueueService, useValue: queueService },
        { provide: SUMMARIZATION_PROVIDER, useValue: fakeProvider },
      ],
    }).compile();

    service = module.get<SummaryWorkerService>(SummaryWorkerService);
  });

  // -----------------------------------------------------------------------
  // onModuleInit
  // -----------------------------------------------------------------------

  it('registers a processor for summary-generation on init', () => {
    service.onModuleInit();
    expect(queueService.registerProcessor).toHaveBeenCalledWith(
      'summary-generation',
      expect.any(Function),
    );
  });

  // -----------------------------------------------------------------------
  // processSummaryJob
  // -----------------------------------------------------------------------

  describe('processSummaryJob', () => {
    it('transitions status to completed and populates LLM output fields', async () => {
      const pendingSummary = { id: 's1', candidateId: 'c1', status: 'pending' };
      const documents = [{ rawText: 'Experienced engineer with 5 years...' }];

      summaryRepository.findOne.mockResolvedValue(pendingSummary);
      documentRepository.find.mockResolvedValue(documents);
      summaryRepository.save.mockImplementation(async (v: unknown) => v);

      await service.processSummaryJob({ summaryId: 's1', candidateId: 'c1' });

      expect(summaryRepository.save).toHaveBeenCalledTimes(1);
      const saved = summaryRepository.save.mock.calls[0][0];
      expect(saved.status).toBe('completed');
      expect(typeof saved.score).toBe('number');
      expect(Array.isArray(saved.strengths)).toBe(true);
      expect(Array.isArray(saved.concerns)).toBe(true);
      expect(typeof saved.summary).toBe('string');
      expect(['advance', 'hold', 'reject']).toContain(saved.recommendedDecision);
      expect(saved.errorMessage).toBeNull();
    });

    it('transitions status to failed when the provider throws', async () => {
      const pendingSummary = { id: 's1', candidateId: 'c1', status: 'pending' };
      summaryRepository.findOne.mockResolvedValue(pendingSummary);
      documentRepository.find.mockResolvedValue([{ rawText: 'some text' }]);
      summaryRepository.save.mockImplementation(async (v: unknown) => v);

      // Override provider to throw
      jest.spyOn(fakeProvider, 'generateCandidateSummary').mockRejectedValue(
        new Error('Provider rate limit exceeded'),
      );

      await service.processSummaryJob({ summaryId: 's1', candidateId: 'c1' });

      const saved = summaryRepository.save.mock.calls[0][0];
      expect(saved.status).toBe('failed');
      expect(saved.errorMessage).toContain('Provider rate limit exceeded');
    });

    it('skips processing when summary is already completed (idempotency)', async () => {
      const completedSummary = { id: 's1', candidateId: 'c1', status: 'completed' };
      summaryRepository.findOne.mockResolvedValue(completedSummary);

      await service.processSummaryJob({ summaryId: 's1', candidateId: 'c1' });

      expect(documentRepository.find).not.toHaveBeenCalled();
      expect(summaryRepository.save).not.toHaveBeenCalled();
    });

    it('skips processing when summary is not found', async () => {
      summaryRepository.findOne.mockResolvedValue(null);

      await service.processSummaryJob({ summaryId: 'ghost', candidateId: 'c1' });

      expect(documentRepository.find).not.toHaveBeenCalled();
      expect(summaryRepository.save).not.toHaveBeenCalled();
    });

    it('marks as failed when the provider returns malformed output', async () => {
      const pendingSummary = { id: 's1', candidateId: 'c1', status: 'pending' };
      summaryRepository.findOne.mockResolvedValue(pendingSummary);
      documentRepository.find.mockResolvedValue([{ rawText: 'text' }]);
      summaryRepository.save.mockImplementation(async (v: unknown) => v);

      // Return an invalid score (string instead of number)
      jest.spyOn(fakeProvider, 'generateCandidateSummary').mockResolvedValue({
        score: 'not-a-number' as unknown as number,
        strengths: [],
        concerns: [],
        summary: 'ok',
        recommendedDecision: 'advance',
      });

      await service.processSummaryJob({ summaryId: 's1', candidateId: 'c1' });

      const saved = summaryRepository.save.mock.calls[0][0];
      expect(saved.status).toBe('failed');
      expect(saved.errorMessage).toMatch(/score/);
    });
  });
});

// ---------------------------------------------------------------------------
// validateSummaryResult unit tests
// ---------------------------------------------------------------------------

describe('validateSummaryResult', () => {
  const valid = {
    score: 75,
    strengths: ['Good communicator'],
    concerns: ['Needs more backend depth'],
    summary: 'Solid candidate with room to grow.',
    recommendedDecision: 'hold' as const,
  };

  it('does not throw for a valid result', () => {
    expect(() => validateSummaryResult(valid)).not.toThrow();
  });

  it('throws when score is not a number', () => {
    expect(() => validateSummaryResult({ ...valid, score: 'high' as unknown as number })).toThrow(
      /score/,
    );
  });

  it('throws when strengths is not an array', () => {
    expect(() =>
      validateSummaryResult({ ...valid, strengths: 'strong' as unknown as string[] }),
    ).toThrow(/strengths/);
  });

  it('throws when recommendedDecision is invalid', () => {
    expect(() =>
      validateSummaryResult({ ...valid, recommendedDecision: 'maybe' as 'advance' }),
    ).toThrow(/recommendedDecision/);
  });

  it('throws when summary is empty', () => {
    expect(() => validateSummaryResult({ ...valid, summary: '   ' })).toThrow(/summary/);
  });
});
