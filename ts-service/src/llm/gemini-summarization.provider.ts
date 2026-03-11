import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { validateSummaryResult } from '../candidates/summary-worker.service';
import {
  CandidateSummaryInput,
  CandidateSummaryResult,
  SummarizationProvider,
} from './summarization-provider.interface';

/**
 * Production summarization provider backed by Google's Gemini API.
 *
 * Uses `gemini-2.0-flash` for fast, cost-effective structured output.
 * The model is instructed to return a JSON object matching
 * `CandidateSummaryResult` via `responseMimeType: "application/json"`.
 *
 * Configuration:
 *   Set GEMINI_API_KEY in your .env file.  A free key can be obtained from
 *   https://aistudio.google.com/apikey
 *
 * Limitations:
 *   - Rate limits on the free tier may cause failures under heavy load.
 *   - Context window limits apply for very long documents.
 */
@Injectable()
export class GeminiSummarizationProvider implements SummarizationProvider {
  private readonly logger = new Logger(GeminiSummarizationProvider.name);
  private readonly model;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>('GEMINI_API_KEY');
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        // Request structured JSON output — reduces hallucinated formatting
        responseMimeType: 'application/json',
      },
    });
  }

  async generateCandidateSummary(
    input: CandidateSummaryInput,
  ): Promise<CandidateSummaryResult> {
    const { candidateId, documents } = input;

    if (documents.length === 0) {
      throw new Error(`No documents available for candidate ${candidateId}`);
    }

    const combinedText = documents
      .map((text, i) => `--- Document ${i + 1} ---\n${text}`)
      .join('\n\n');

    const prompt = buildPrompt(combinedText);

    this.logger.log(
      `Calling Gemini for candidate ${candidateId} (${documents.length} document(s))`,
    );

    const result = await this.model.generateContent(prompt);
    const responseText = result.response.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      throw new Error(`Gemini returned non-JSON response: ${responseText.slice(0, 200)}`);
    }

    // Validate the parsed output matches the expected schema before returning
    validateSummaryResult(parsed as CandidateSummaryResult);

    return parsed as CandidateSummaryResult;
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Construct the Gemini prompt requesting a structured candidate evaluation.
 *
 * The prompt explicitly specifies the JSON schema so the model can produce
 * a well-formed response even without function-calling support.
 */
function buildPrompt(documentText: string): string {
  return `You are an expert technical recruiter evaluating a candidate based on their submitted documents.

Analyse the following candidate documents carefully and provide a structured evaluation.

Return ONLY a valid JSON object with exactly these fields:
{
  "score": <integer 0-100 representing overall candidate fit>,
  "strengths": [<array of strings, each describing a specific strength>],
  "concerns": [<array of strings, each describing a specific concern or gap>],
  "summary": "<single paragraph summarising the candidate's profile>",
  "recommendedDecision": "<one of: advance, hold, reject>"
}

Decision guide:
- advance: Strong candidate, recommend moving to next stage
- hold:    Potential candidate, needs further evaluation or has gaps
- reject:  Does not meet minimum requirements

Candidate Documents:
${documentText}`;
}
