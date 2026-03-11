import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

/**
 * Creates candidate_documents and candidate_summaries tables.
 *
 * candidate_documents  — stores uploaded resume / cover-letter text per candidate
 * candidate_summaries  — stores async LLM-generated evaluation results per candidate
 *
 * Both tables reference sample_candidates(id) with ON DELETE CASCADE so that
 * removing a candidate cleans up all associated records automatically.
 */
export class CreateDocumentsAndSummaries1720000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ------------------------------------------------------------------
    // candidate_documents
    // ------------------------------------------------------------------
    await queryRunner.createTable(
      new Table({
        name: 'candidate_documents',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          { name: 'candidate_id', type: 'varchar', length: '64', isNullable: false },
          { name: 'document_type', type: 'varchar', length: '50', isNullable: false },
          { name: 'file_name', type: 'varchar', length: '255', isNullable: false },
          // Logical storage path, e.g. documents/{candidateId}/{uuid}-{fileName}
          { name: 'storage_key', type: 'varchar', length: '500', isNullable: false },
          { name: 'raw_text', type: 'text', isNullable: false },
          { name: 'uploaded_at', type: 'timestamptz', default: 'now()', isNullable: false },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      'candidate_documents',
      new TableForeignKey({
        name: 'fk_candidate_documents_candidate_id',
        columnNames: ['candidate_id'],
        referencedTableName: 'sample_candidates',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'candidate_documents',
      new TableIndex({
        name: 'idx_candidate_documents_candidate_id',
        columnNames: ['candidate_id'],
      }),
    );

    // ------------------------------------------------------------------
    // candidate_summaries
    // ------------------------------------------------------------------
    await queryRunner.createTable(
      new Table({
        name: 'candidate_summaries',
        columns: [
          { name: 'id', type: 'varchar', length: '64', isPrimary: true },
          { name: 'candidate_id', type: 'varchar', length: '64', isNullable: false },
          // Lifecycle: pending → completed | failed
          { name: 'status', type: 'varchar', length: '20', isNullable: false, default: "'pending'" },
          // LLM output fields — all nullable until the job completes
          { name: 'score', type: 'integer', isNullable: true },
          { name: 'strengths', type: 'jsonb', isNullable: true },
          { name: 'concerns', type: 'jsonb', isNullable: true },
          { name: 'summary', type: 'text', isNullable: true },
          { name: 'recommended_decision', type: 'varchar', length: '20', isNullable: true },
          // Provider metadata for traceability and reproducibility
          { name: 'provider', type: 'varchar', length: '50', isNullable: true },
          { name: 'prompt_version', type: 'varchar', length: '20', isNullable: true },
          // Populated on failure
          { name: 'error_message', type: 'text', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()', isNullable: false },
          { name: 'updated_at', type: 'timestamptz', default: 'now()', isNullable: false },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      'candidate_summaries',
      new TableForeignKey({
        name: 'fk_candidate_summaries_candidate_id',
        columnNames: ['candidate_id'],
        referencedTableName: 'sample_candidates',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'candidate_summaries',
      new TableIndex({
        name: 'idx_candidate_summaries_candidate_id',
        columnNames: ['candidate_id'],
      }),
    );

    // Index on status so worker queries for pending jobs are efficient
    await queryRunner.createIndex(
      'candidate_summaries',
      new TableIndex({
        name: 'idx_candidate_summaries_status',
        columnNames: ['status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse order to respect FK constraints
    await queryRunner.dropIndex('candidate_summaries', 'idx_candidate_summaries_status');
    await queryRunner.dropIndex('candidate_summaries', 'idx_candidate_summaries_candidate_id');
    await queryRunner.dropForeignKey('candidate_summaries', 'fk_candidate_summaries_candidate_id');
    await queryRunner.dropTable('candidate_summaries');

    await queryRunner.dropIndex('candidate_documents', 'idx_candidate_documents_candidate_id');
    await queryRunner.dropForeignKey('candidate_documents', 'fk_candidate_documents_candidate_id');
    await queryRunner.dropTable('candidate_documents');
  }
}
