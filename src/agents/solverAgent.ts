import type { Question, QuestionResult, AnswerKey } from "../types.js";
import { searchWeb } from "../tools/webSearch.js";
import { askLLM } from "../tools/llm.js";

export async function solveQuestion(
  question: Question,
  answerKey: AnswerKey
): Promise<QuestionResult> {
  const startTime = Date.now();

  let searchQuery = "";
  let searchResultsCount = 0;
  let searchResults = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let selectedAnswer: "a" | "b" | "c" | "d" | null = null;
  let error: string | undefined;

  try {
    // Step 1: Web search (always search first strategy)
    const searchResponse = await searchWeb(question);
    searchQuery = searchResponse.query;
    searchResultsCount = searchResponse.resultCount;
    searchResults = searchResponse.results;

    // Step 2: Ask LLM with search context
    const llmResponse = await askLLM(question, searchResults);
    promptTokens = llmResponse.promptTokens;
    completionTokens = llmResponse.completionTokens;

    // Step 3: Parse answer
    const answer = llmResponse.answer.trim().toLowerCase();
    if (["a", "b", "c", "d"].includes(answer)) {
      selectedAnswer = answer as "a" | "b" | "c" | "d";
    } else {
      // Try to extract answer from longer response
      const match = answer.match(/^[abcd]/);
      if (match) {
        selectedAnswer = match[0] as "a" | "b" | "c" | "d";
      } else {
        error = `Invalid LLM response: "${llmResponse.answer}"`;
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const correctAnswer = answerKey[String(question.id)] || "a";
  const timeMs = Date.now() - startTime;

  return {
    questionId: question.id,
    selectedAnswer,
    correctAnswer,
    isCorrect: selectedAnswer === correctAnswer,
    searchQuery,
    searchResultsCount,
    promptTokens,
    completionTokens,
    timeMs,
    error,
  };
}

// Process a batch of questions in parallel
export async function solveBatch(
  questions: Question[],
  answerKey: AnswerKey,
  onQuestionComplete?: (result: QuestionResult) => void
): Promise<QuestionResult[]> {
  const promises = questions.map(async (question) => {
    const result = await solveQuestion(question, answerKey);
    if (onQuestionComplete) {
      onQuestionComplete(result);
    }
    return result;
  });

  return Promise.all(promises);
}
