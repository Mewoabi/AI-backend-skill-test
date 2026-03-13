import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { SampleCandidate } from './sample-candidate.entity';

/** Allowed values for the summary status lifecycle. */
export type SummaryStatus = 'pending' | 'completed' | 'failed';

/** Allowed values for the recommended hiring decision. */
export type RecommendedDecision = 'advance' | 'hold' | 'reject';

/**
 * Persisted result of an LLM-based candidate evaluation.
 *
 * A summary starts as 'pending' the moment the generation job is queued.
 * The worker transitions it to 'completed' (with all output fields populated)
 * or 'failed' (with errorMessage set) once the LLM call resolves.
 *
 * provider and promptVersion are stored so that results can be attributed to a
 * specific model/prompt combination, making future comparisons or re-evaluations
 * traceable.
 */
@Entity({ name: 'candidate_summaries' })
export class CandidateSummary {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ name: 'candidate_id', type: 'varchar', length: 64 })
  candidateId!: string;

  /** Current lifecycle state: pending | completed | failed. */
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: SummaryStatus;

  /** Numeric fit score (0–100) returned by the LLM. Null until completed. */
  @Column({ type: 'integer', nullable: true })
  score!: number | null;

  /** List of candidate strengths identified by the LLM. Stored as JSONB. */
  @Column({ type: 'jsonb', nullable: true })
  strengths!: string[] | null;

  /** List of concerns or weaknesses identified by the LLM. Stored as JSONB. */
  @Column({ type: 'jsonb', nullable: true })
  concerns!: string[] | null;

  /** Free-text summary paragraph produced by the LLM. */
  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  /** Hiring recommendation from the LLM: advance | hold | reject. */
  @Column({ name: 'recommended_decision', type: 'varchar', length: 20, nullable: true })
  recommendedDecision!: RecommendedDecision | null;

  /** Name of the LLM provider used (e.g. 'gemini'). */
  @Column({ type: 'varchar', length: 50, nullable: true })
  provider!: string | null;

  /** Version of the prompt template used for reproducibility. */
  @Column({ name: 'prompt_version', type: 'varchar', length: 20, nullable: true })
  promptVersion!: string | null;

  /** Error details when status is 'failed'. */
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => SampleCandidate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidate_id' })
  candidate!: SampleCandidate;
}
