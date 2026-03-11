import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { CandidateDocument } from '../entities/candidate-document.entity';
import { CandidateSummary } from '../entities/candidate-summary.entity';
import { SampleCandidate } from '../entities/sample-candidate.entity';
import { SampleWorkspace } from '../entities/sample-workspace.entity';
import { LlmModule } from '../llm/llm.module';
import { QueueModule } from '../queue/queue.module';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { SummaryWorkerService } from './summary-worker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SampleCandidate,
      SampleWorkspace,
      CandidateDocument,
      CandidateSummary,
    ]),
    QueueModule,
    LlmModule,
    AuthModule,
  ],
  controllers: [CandidatesController],
  providers: [CandidatesService, SummaryWorkerService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
