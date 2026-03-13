import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Request body for uploading a candidate document.
 *
 * The caller provides the raw text content of the file (resume, cover letter,
 * etc.) together with metadata. A `storageKey` is optional — when omitted the
 * service auto-generates a logical path of the form:
 *   documents/{candidateId}/{uuid}-{fileName}
 */
export class UploadDocumentDto {
  /**
   * Category of the document being uploaded.
   * Common values: 'resume', 'cover_letter', 'portfolio', 'reference'.
   */
  @ApiProperty({ example: 'resume', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  documentType!: string;

  /** Original file name, e.g. 'jane_doe_cv.pdf'. */
  @ApiProperty({ example: 'jane_doe_cv.pdf', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  /**
   * Full extracted text content of the document.
   * This is the text that will be passed as context to the LLM during
   * summary generation.
   */
  @ApiProperty({ example: 'Jane Doe — Senior Software Engineer with 8 years of experience...' })
  @IsString()
  @IsNotEmpty()
  rawText!: string;

  /**
   * Optional explicit storage key / path.
   * If not provided, the service generates one automatically.
   */
  @ApiPropertyOptional({ example: 'documents/c1/abc123-jane_doe_cv.pdf', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  storageKey?: string;
}
