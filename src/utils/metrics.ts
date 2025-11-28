import type { Metrics, BatchResult, QuestionResult } from "../types.js";

export class MetricsTracker {
  private startTime: number = 0;
  private promptTokens: number = 0;
  private completionTokens: number = 0;
  private serperCalls: number = 0;
  private llmCalls: number = 0;
  private batchResults: BatchResult[] = [];

  start(): void {
    this.startTime = Date.now();
    this.promptTokens = 0;
    this.completionTokens = 0;
    this.serperCalls = 0;
    this.llmCalls = 0;
    this.batchResults = [];
  }

  addTokenUsage(prompt: number, completion: number): void {
    this.promptTokens += prompt;
    this.completionTokens += completion;
  }

  incrementSerperCalls(count: number = 1): void {
    this.serperCalls += count;
  }

  incrementLLMCalls(count: number = 1): void {
    this.llmCalls += count;
  }

  addBatchResult(batch: BatchResult): void {
    this.batchResults.push(batch);
  }

  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  calculateFinalMetrics(): Metrics {
    const totalTimeMs = this.getElapsedTime();
    const totalQuestions = this.batchResults.reduce(
      (sum, batch) => sum + batch.totalQuestions,
      0
    );
    const correctAnswers = this.batchResults.reduce(
      (sum, batch) => sum + batch.correctCount,
      0
    );

    return {
      totalQuestions,
      correctAnswers,
      accuracy: totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0,
      totalTimeMs,
      avgTimePerQuestion: totalQuestions > 0 ? totalTimeMs / totalQuestions : 0,
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.promptTokens + this.completionTokens,
      serperApiCalls: this.serperCalls,
      llmCalls: this.llmCalls,
      batchResults: this.batchResults,
    };
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function printFinalReport(metrics: Metrics): void {
  const divider = "═".repeat(55);
  const thinDivider = "─".repeat(55);

  console.log("\n" + divider);
  console.log("         UPSC PRELIMS SOLVER - FINAL REPORT");
  console.log(divider + "\n");

  // Accuracy section
  console.log("ACCURACY:");
  console.log(
    `  Correct: ${metrics.correctAnswers}/${metrics.totalQuestions} (${metrics.accuracy.toFixed(1)}%)`
  );
  console.log(
    `  Incorrect: ${metrics.totalQuestions - metrics.correctAnswers}/${metrics.totalQuestions}`
  );

  console.log("\n" + thinDivider + "\n");

  // Time section
  console.log("TIME:");
  console.log(`  Total Duration: ${formatDuration(metrics.totalTimeMs)}`);
  console.log(`  Avg per Question: ${formatDuration(Math.round(metrics.avgTimePerQuestion))}`);

  console.log("\n" + thinDivider + "\n");

  // Token usage section
  console.log("TOKEN USAGE:");
  console.log(`  Prompt Tokens: ${formatNumber(metrics.promptTokens)}`);
  console.log(`  Completion Tokens: ${formatNumber(metrics.completionTokens)}`);
  console.log(`  Total Tokens: ${formatNumber(metrics.totalTokens)}`);

  console.log("\n" + thinDivider + "\n");

  // API calls section
  console.log("API CALLS:");
  console.log(`  Serper Searches: ${metrics.serperApiCalls}`);
  console.log(`  LLM Calls: ${metrics.llmCalls}`);

  console.log("\n" + thinDivider + "\n");

  // Batch breakdown section
  console.log("BATCH BREAKDOWN:");
  for (const batch of metrics.batchResults) {
    console.log(
      `  Batch ${batch.batchNumber}: ${batch.correctCount}/${batch.totalQuestions} correct (${batch.accuracy.toFixed(0)}%) - ${formatDuration(batch.totalTimeMs)}`
    );
  }

  console.log("\n" + divider + "\n");
}

export function createBatchResult(
  batchNumber: number,
  results: QuestionResult[],
  batchTimeMs: number
): BatchResult {
  const correctCount = results.filter((r) => r.isCorrect).length;
  return {
    batchNumber,
    results,
    totalTimeMs: batchTimeMs,
    correctCount,
    totalQuestions: results.length,
    accuracy: results.length > 0 ? (correctCount / results.length) * 100 : 0,
  };
}
