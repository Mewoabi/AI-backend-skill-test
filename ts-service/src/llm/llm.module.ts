import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FakeSummarizationProvider } from './fake-summarization.provider';
import { GeminiSummarizationProvider } from './gemini-summarization.provider';
import { SUMMARIZATION_PROVIDER } from './summarization-provider.interface';

/**
 * Provides the SummarizationProvider implementation selected at runtime.
 *
 * - When GEMINI_API_KEY is set in the environment, GeminiSummarizationProvider
 *   is used (real LLM calls).
 * - When the key is absent (e.g. during automated tests), FakeSummarizationProvider
 *   is used instead, returning deterministic mock responses without any API calls.
 *
 * Consumers depend only on the SUMMARIZATION_PROVIDER injection token — they
 * are completely decoupled from the concrete implementation.
 */
@Module({
  providers: [
    FakeSummarizationProvider,
    GeminiSummarizationProvider,
    {
      provide: SUMMARIZATION_PROVIDER,
      useFactory: (
        configService: ConfigService,
        gemini: GeminiSummarizationProvider,
        fake: FakeSummarizationProvider,
      ) => {
        const hasKey = !!configService.get<string>('GEMINI_API_KEY');
        return hasKey ? gemini : fake;
      },
      inject: [ConfigService, GeminiSummarizationProvider, FakeSummarizationProvider],
    },
  ],
  exports: [SUMMARIZATION_PROVIDER, FakeSummarizationProvider],
})
export class LlmModule {}
