import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Question, AnswerKey, Config, Metrics, QuestionResult } from "./types.js";
import { initializeLLM } from "./tools/llm.js";
import { initializeWebSearch, getApiCallCount } from "./tools/webSearch.js";
import { solveBatch } from "./agents/solverAgent.js";
import {
  MetricsTracker,
  printFinalReport,
  createBatchResult,
} from "./utils/metrics.js";
import { createProgressTracker } from "./utils/progress.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// Configuration
const BATCH_SIZE = 20;

function loadConfig(): Config {
  const envPath = join(projectRoot, "azure-openai.env");
  const envContent = readFileSync(envPath, "utf-8");

  const config: Partial<Config> = {};

  // Parse env file
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^(\w+)=["']?([^"'\n]+)["']?$/);
    if (match) {
      const [, key, value] = match;
      switch (key) {
        case "ENDPOINT":
          config.endpoint = value;
          break;
        case "MODEL_NAME":
          config.modelName = value;
          break;
        case "DEPLOYMENT_NAME":
          config.deploymentName = value;
          break;
        case "API_KEY":
          config.apiKey = value;
          break;
        case "SERPER_API_KEY":
          config.serperApiKey = value;
          break;
      }
    }
  }

  // Validate config
  const required = ["endpoint", "modelName", "deploymentName", "apiKey", "serperApiKey"];
  for (const field of required) {
    if (!config[field as keyof Config]) {
      throw new Error(`Missing required config: ${field}`);
    }
  }

  return config as Config;
}

function loadQuestions(): Question[] {
  const questionsPath = join(projectRoot, "questions.json");
  const content = readFileSync(questionsPath, "utf-8");
  return JSON.parse(content) as Question[];
}

function loadAnswerKey(): AnswerKey {
  const answersPath = join(projectRoot, "answers.json");
  const content = readFileSync(answersPath, "utf-8");
  return JSON.parse(content) as AnswerKey;
}

function saveResults(metrics: Metrics, allResults: QuestionResult[]): string {
  const resultsDir = join(projectRoot, "results");
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `run_${timestamp}.json`;
  const filepath = join(resultsDir, filename);

  const output = {
    timestamp: new Date().toISOString(),
    summary: {
      totalQuestions: metrics.totalQuestions,
      correctAnswers: metrics.correctAnswers,
      accuracy: `${metrics.accuracy.toFixed(2)}%`,
      totalTimeMs: metrics.totalTimeMs,
      totalTokens: metrics.totalTokens,
      serperApiCalls: metrics.serperApiCalls,
    },
    batchResults: metrics.batchResults.map((b) => ({
      batch: b.batchNumber,
      correct: b.correctCount,
      total: b.totalQuestions,
      accuracy: `${b.accuracy.toFixed(2)}%`,
      timeMs: b.totalTimeMs,
    })),
    questionResults: allResults.map((r) => ({
      id: r.questionId,
      selected: r.selectedAnswer,
      correct: r.correctAnswer,
      isCorrect: r.isCorrect,
      searchQuery: r.searchQuery,
      tokens: r.promptTokens + r.completionTokens,
      timeMs: r.timeMs,
      error: r.error,
    })),
  };

  writeFileSync(filepath, JSON.stringify(output, null, 2));
  return filepath;
}

export async function runOrchestrator(): Promise<void> {
  console.log("🔧 Loading configuration...");
  const config = loadConfig();

  console.log("📚 Loading questions and answers...");
  const questions = loadQuestions();
  const answerKey = loadAnswerKey();

  console.log("🔌 Initializing LLM and Web Search...");
  initializeLLM(config);
  initializeWebSearch(config.serperApiKey);

  const totalBatches = Math.ceil(questions.length / BATCH_SIZE);
  const progress = createProgressTracker();
  const metrics = new MetricsTracker();

  // Start tracking
  metrics.start();
  progress.start(questions.length, totalBatches);

  const allResults: QuestionResult[] = [];
  let completedInBatch = 0;

  // Process batches sequentially
  for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
    const startIdx = (batchNum - 1) * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, questions.length);
    const batchQuestions = questions.slice(startIdx, endIdx);

    progress.startBatch(batchNum, batchQuestions.length);
    const batchStartTime = Date.now();
    completedInBatch = 0;

    // Solve batch in parallel
    const batchResults = await solveBatch(
      batchQuestions,
      answerKey,
      (result) => {
        completedInBatch++;
        progress.updateBatchProgress(completedInBatch, batchQuestions.length);
        metrics.addTokenUsage(result.promptTokens, result.completionTokens);
        metrics.incrementLLMCalls();
        if (result.searchResultsCount > 0) {
          metrics.incrementSerperCalls();
        }
      }
    );

    const batchTimeMs = Date.now() - batchStartTime;
    const batchCorrect = batchResults.filter((r) => r.isCorrect).length;

    // Update metrics
    const batchResult = createBatchResult(batchNum, batchResults, batchTimeMs);
    metrics.addBatchResult(batchResult);

    // Update progress
    progress.completeBatch(batchNum, batchCorrect, batchQuestions.length);

    allResults.push(...batchResults);
  }

  progress.stop();

  // Calculate final metrics
  const finalMetrics = metrics.calculateFinalMetrics();

  // Update serper calls from actual count
  finalMetrics.serperApiCalls = getApiCallCount();

  // Print final report
  printFinalReport(finalMetrics);

  // Save results
  const resultsPath = saveResults(finalMetrics, allResults);
  console.log(`📁 Detailed results saved to: ${resultsPath}\n`);

  // Print incorrect answers for review
  const incorrectAnswers = allResults.filter((r) => !r.isCorrect);
  if (incorrectAnswers.length > 0) {
    console.log(`\n❌ Incorrect answers (${incorrectAnswers.length}):`);
    console.log("─".repeat(40));
    for (const result of incorrectAnswers) {
      console.log(
        `  Q${result.questionId}: Selected '${result.selectedAnswer}', Correct '${result.correctAnswer}'${result.error ? ` (Error: ${result.error})` : ""}`
      );
    }
    console.log("");
  }
}
