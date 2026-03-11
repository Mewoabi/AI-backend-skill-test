import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { SampleCandidate } from './sample-candidate.entity';

/**
 * Represents a single uploaded candidate document (resume, cover letter, etc.).
 *
 * rawText holds the extracted text content that is passed to the LLM during
 * summary generation.  storageKey is a logical path that can later be mapped
 * to a real object-store bucket key if file storage is introduced.
 */
@Entity({ name: 'candidate_documents' })
export class CandidateDocument {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ name: 'candidate_id', type: 'varchar', length: 64 })
  candidateId!: string;

  /** Type of document, e.g. 'resume', 'cover_letter', 'portfolio'. */
  @Column({ name: 'document_type', type: 'varchar', length: 50 })
  documentType!: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName!: string;

  /**
   * Logical storage path for the file.
   * Auto-generated as `documents/{candidateId}/{uuid}-{fileName}` when not
   * provided by the caller.
   */
  @Column({ name: 'storage_key', type: 'varchar', length: 500 })
  storageKey!: string;

  /** Full text content of the document, used as LLM context. */
  @Column({ name: 'raw_text', type: 'text' })
  rawText!: string;

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt!: Date;

  @ManyToOne(() => SampleCandidate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidate_id' })
  candidate!: SampleCandidate;
}
