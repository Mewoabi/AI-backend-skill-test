import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { CandidateDocument } from '../entities/candidate-document.entity';
import { CandidateSummary } from '../entities/candidate-summary.entity';
import { SampleCandidate } from '../entities/sample-candidate.entity';
import { QueueService } from '../queue/queue.service';
import { CandidatesService } from './candidates.service';

describe('CandidatesService', () => {
  let service: CandidatesService;

  // -----------------------------------------------------------------------
  // Mock repositories
  // -----------------------------------------------------------------------

  const candidateRepository = {
    findOne: jest.fn(),
  };

  const documentRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const summaryRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const queueService = {
    enqueue: jest.fn(),
  };

  // -----------------------------------------------------------------------
  // Setup
  // -----------------------------------------------------------------------

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidatesService,
        { provide: getRepositoryToken(SampleCandidate), useValue: candidateRepository },
        { provide: getRepositoryToken(CandidateDocument), useValue: documentRepository },
        { provide: getRepositoryToken(CandidateSummary), useValue: summaryRepository },
        { provide: QueueService, useValue: queueService },
      ],
    }).compile();

    service = module.get<CandidatesService>(CandidatesService);
  });

  // -----------------------------------------------------------------------
  // verifyCandidateAccess
  // -----------------------------------------------------------------------

  describe('verifyCandidateAccess', () => {
    it('returns candidate when found in workspace', async () => {
      const candidate = { id: 'c1', workspaceId: 'ws1' };
      candidateRepository.findOne.mockResolvedValue(candidate);

      const result = await service.verifyCandidateAccess('c1', 'ws1');

      expect(result).toEqual(candidate);
      expect(candidateRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'c1', workspaceId: 'ws1' },
      });
    });

    it('throws NotFoundException when candidate not found in workspace', async () => {
      candidateRepository.findOne.mockResolvedValue(null);

      await expect(service.verifyCandidateAccess('c1', 'ws2')).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // uploadDocument
  // -----------------------------------------------------------------------

  describe('uploadDocument', () => {
    const user = { userId: 'u1', workspaceId: 'ws1' };
    const candidate = { id: 'c1', workspaceId: 'ws1' };

    it('stores a document for a valid candidate', async () => {
      candidateRepository.findOne.mockResolvedValue(candidate);
      documentRepository.create.mockImplementation((v: unknown) => v);
      documentRepository.save.mockImplementation(async (v: unknown) => v);

      const result = await service.uploadDocument(user, 'c1', {
        documentType: 'resume',
        fileName: 'cv.pdf',
        rawText: 'John Doe — Senior Engineer',
      });

      expect(documentRepository.save).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ candidateId: 'c1', documentType: 'resume' });
    });

    it('auto-generates storageKey when not provided', async () => {
      candidateRepository.findOne.mockResolvedValue(candidate);
      documentRepository.create.mockImplementation((v: unknown) => v);
      documentRepository.save.mockImplementation(async (v: unknown) => v);

      const result = await service.uploadDocument(user, 'c1', {
        documentType: 'cover_letter',
        fileName: 'cover.pdf',
        rawText: 'Dear Hiring Manager...',
      });

      expect((result as { storageKey: string }).storageKey).toMatch(/^documents\/c1\//);
    });

    it('rejects when candidate belongs to a different workspace', async () => {
      candidateRepository.findOne.mockResolvedValue(null);

      await expect(
        service.uploadDocument(user, 'c1', {
          documentType: 'resume',
          fileName: 'cv.pdf',
          rawText: 'text',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // requestSummaryGeneration
  // -----------------------------------------------------------------------

  describe('requestSummaryGeneration', () => {
    const user = { userId: 'u1', workspaceId: 'ws1' };
    const candidate = { id: 'c1', workspaceId: 'ws1' };

    it('creates a pending summary and enqueues a job', async () => {
      candidateRepository.findOne.mockResolvedValue(candidate);
      summaryRepository.findOne.mockResolvedValue(null); // no existing pending summary
      summaryRepository.create.mockImplementation((v: unknown) => v);
      summaryRepository.save.mockImplementation(async (v: unknown) => v);

      const result = await service.requestSummaryGeneration(user, 'c1');

      expect(result).toMatchObject({ candidateId: 'c1', status: 'pending' });
      expect(queueService.enqueue).toHaveBeenCalledWith('summary-generation', {
        summaryId: expect.any(String),
        candidateId: 'c1',
      });
    });

    it('returns existing pending summary instead of creating a duplicate', async () => {
      const existing = { id: 'existing-id', candidateId: 'c1', status: 'pending' };
      candidateRepository.findOne.mockResolvedValue(candidate);
      summaryRepository.findOne.mockResolvedValue(existing);

      const result = await service.requestSummaryGeneration(user, 'c1');

      expect(result).toEqual(existing);
      expect(summaryRepository.save).not.toHaveBeenCalled();
      expect(queueService.enqueue).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // listSummaries
  // -----------------------------------------------------------------------

  describe('listSummaries', () => {
    it('returns all summaries for a valid candidate', async () => {
      const user = { userId: 'u1', workspaceId: 'ws1' };
      const candidate = { id: 'c1', workspaceId: 'ws1' };
      const summaries = [{ id: 's1', status: 'completed' }, { id: 's2', status: 'pending' }];

      candidateRepository.findOne.mockResolvedValue(candidate);
      summaryRepository.find.mockResolvedValue(summaries);

      const result = await service.listSummaries(user, 'c1');

      expect(result).toEqual(summaries);
      expect(summaryRepository.find).toHaveBeenCalledWith({
        where: { candidateId: 'c1' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  // -----------------------------------------------------------------------
  // getSummary
  // -----------------------------------------------------------------------

  describe('getSummary', () => {
    const user = { userId: 'u1', workspaceId: 'ws1' };
    const candidate = { id: 'c1', workspaceId: 'ws1' };

    it('returns the requested summary', async () => {
      const summary = { id: 's1', candidateId: 'c1', status: 'completed' };
      candidateRepository.findOne.mockResolvedValue(candidate);
      summaryRepository.findOne.mockResolvedValue(summary);

      const result = await service.getSummary(user, 'c1', 's1');

      expect(result).toEqual(summary);
    });

    it('throws NotFoundException for non-existent summary', async () => {
      candidateRepository.findOne.mockResolvedValue(candidate);
      summaryRepository.findOne.mockResolvedValue(null);

      await expect(service.getSummary(user, 'c1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
