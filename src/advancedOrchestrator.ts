import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Question, AnswerKey, Config, Answer, PipelineResult } from "./types.js";
import { initializeLLM } from "./tools/llm.js";
import { initializeWebSearch } from "./tools/webSearch.js";
import { solvePipeline } from "./agents/advancedAgents.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// Configuration
const BATCH_SIZE = 10; // Smaller batches for more LLM calls per question

function loadConfig(): Config {
  const envPath = join(projectRoot, "azure-openai.env");
  const envContent = readFileSync(envPath, "utf-8");

  const config: Partial<Config> = {};

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

function saveResults(results: PipelineResult[], metrics: {
  totalTime: number;
  totalLLMCalls: number;
  totalSerperCalls: number;
  totalTokens: number;
  accuracy: number;
}): string {
  const resultsDir = join(projectRoot, "results");
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `advanced_run_${timestamp}.json`;
  const filepath = join(resultsDir, filename);

  const output = {
    timestamp: new Date().toISOString(),
    framework: "Advanced Agentic Framework",
    summary: metrics,
    results: results.map((r) => ({
      id: r.questionId,
      finalAnswer: r.finalAnswer,
      correctAnswer: r.correctAnswer,
      isCorrect: r.isCorrect,
      confidence: r.confidence,
      llmCalls: r.llmCalls,
      serperCalls: r.serperCalls,
      tokens: r.totalTokens,
      timeMs: r.timeMs,
      error: r.error,
    })),
  };

  writeFileSync(filepath, JSON.stringify(output, null, 2));
  return filepath;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export async function runAdvancedOrchestrator(): Promise<void> {
  console.log("\n" + "═".repeat(60));
  console.log("   UPSC PRELIMS SOLVER - ADVANCED AGENTIC FRAMEWORK");
  console.log("═".repeat(60) + "\n");

  console.log("🔧 Loading configuration...");
  const config = loadConfig();

  console.log("📚 Loading questions and answers...");
  const questions = loadQuestions();
  const answerKey = loadAnswerKey();

  console.log("🔌 Initializing LLM and Web Search...");
  initializeLLM(config);
  initializeWebSearch(config.serperApiKey);

  const totalBatches = Math.ceil(questions.length / BATCH_SIZE);

  console.log(`\n📝 Total Questions: ${questions.length}`);
  console.log(`📦 Batches: ${totalBatches} (${BATCH_SIZE} questions each)`);
  console.log(`🤖 Pipeline: Analyzer → Researcher → Reasoner (3-5x) → Verifier\n`);

  const startTime = Date.now();
  const allResults: PipelineResult[] = [];
  let totalLLMCalls = 0;
  let totalSerperCalls = 0;
  let totalTokens = 0;
  let correctCount = 0;

  // Process batches
  for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
    const startIdx = (batchNum - 1) * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, questions.length);
    const batchQuestions = questions.slice(startIdx, endIdx);

    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (Q${startIdx + 1}-Q${endIdx})...`);
    const batchStartTime = Date.now();

    // Process batch in parallel
    const batchPromises = batchQuestions.map(async (question) => {
      const questionStartTime = Date.now();
      const correctAnswer = answerKey[String(question.id)] as Answer;

      const result = await solvePipeline(question, correctAnswer);

      return {
        questionId: question.id,
        finalAnswer: result.finalAnswer,
        correctAnswer,
        isCorrect: result.isCorrect,
        confidence: result.confidence as "high" | "medium" | "low",
        llmCalls: result.llmCalls,
        serperCalls: result.serperCalls,
        totalTokens: result.totalTokens,
        timeMs: Date.now() - questionStartTime,
      } as PipelineResult;
    });

    const batchResults = await Promise.all(batchPromises);

    // Aggregate batch metrics
    const batchCorrect = batchResults.filter((r) => r.isCorrect).length;
    const batchLLMCalls = batchResults.reduce((sum, r) => sum + r.llmCalls, 0);
    const batchSerperCalls = batchResults.reduce((sum, r) => sum + r.serperCalls, 0);
    const batchTokens = batchResults.reduce((sum, r) => sum + r.totalTokens, 0);

    totalLLMCalls += batchLLMCalls;
    totalSerperCalls += batchSerperCalls;
    totalTokens += batchTokens;
    correctCount += batchCorrect;

    allResults.push(...batchResults);

    const batchTime = Date.now() - batchStartTime;
    const runningAccuracy = ((correctCount / allResults.length) * 100).toFixed(1);

    console.log(`   ✅ ${batchCorrect}/${batchQuestions.length} correct (${((batchCorrect / batchQuestions.length) * 100).toFixed(0)}%)`);
    console.log(`   📊 Running: ${correctCount}/${allResults.length} (${runningAccuracy}%)`);
    console.log(`   ⏱️  ${formatDuration(batchTime)} | 🤖 ${batchLLMCalls} LLM | 🔍 ${batchSerperCalls} Serper`);
  }

  const totalTime = Date.now() - startTime;
  const accuracy = (correctCount / questions.length) * 100;

  // Print final report
  console.log("\n" + "═".repeat(60));
  console.log("              FINAL REPORT - ADVANCED FRAMEWORK");
  console.log("═".repeat(60) + "\n");

  console.log("ACCURACY:");
  console.log(`  Correct: ${correctCount}/${questions.length} (${accuracy.toFixed(1)}%)`);
  console.log(`  Target: 95%+ ${accuracy >= 95 ? "✅ ACHIEVED!" : "❌ Not met"}`);

  console.log("\nTIME:");
  console.log(`  Total Duration: ${formatDuration(totalTime)}`);
  console.log(`  Avg per Question: ${formatDuration(Math.round(totalTime / questions.length))}`);

  console.log("\nAPI USAGE:");
  console.log(`  LLM Calls: ${totalLLMCalls} (${(totalLLMCalls / questions.length).toFixed(1)} per question)`);
  console.log(`  Serper Calls: ${totalSerperCalls} (${(totalSerperCalls / questions.length).toFixed(1)} per question)`);
  console.log(`  Total Tokens: ${totalTokens.toLocaleString()}`);

  console.log("\nCONFIDENCE BREAKDOWN:");
  const highConf = allResults.filter((r) => r.confidence === "high").length;
  const medConf = allResults.filter((r) => r.confidence === "medium").length;
  const lowConf = allResults.filter((r) => r.confidence === "low").length;
  console.log(`  High: ${highConf} | Medium: ${medConf} | Low: ${lowConf}`);

  console.log("\n" + "═".repeat(60) + "\n");

  // Save results
  const resultsPath = saveResults(allResults, {
    totalTime,
    totalLLMCalls,
    totalSerperCalls,
    totalTokens,
    accuracy,
  });
  console.log(`📁 Results saved to: ${resultsPath}\n`);

  // Print incorrect answers
  const incorrectAnswers = allResults.filter((r) => !r.isCorrect);
  if (incorrectAnswers.length > 0 && incorrectAnswers.length <= 20) {
    console.log(`\n❌ Incorrect answers (${incorrectAnswers.length}):`);
    console.log("─".repeat(50));
    for (const result of incorrectAnswers) {
      console.log(
        `  Q${result.questionId}: Selected '${result.finalAnswer}', Correct '${result.correctAnswer}' [${result.confidence}]`
      );
    }
    console.log("");
  }
}
