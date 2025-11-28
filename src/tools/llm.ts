import OpenAI from "openai";
import type { Config, LLMResponse, Question } from "../types.js";

// Extract answer letter from verbose model reasoning
function extractAnswerFromReasoning(text: string): string | null {
  const lowerText = text.toLowerCase();

  // Pattern 1: Direct answer patterns
  const directPatterns = [
    /(?:the\s+)?(?:correct\s+)?answer\s*(?:is|:)\s*\(?([abcd])\)?/i,
    /(?:so|therefore|hence|thus)\s+(?:the\s+)?(?:correct\s+)?answer\s*(?:is|:)?\s*\(?([abcd])\)?/i,
    /\boption\s+([abcd])\s+is\s+correct/i,
    /\b([abcd])\s+is\s+(?:the\s+)?correct\s+(?:answer|option)/i,
  ];

  for (const pattern of directPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].toLowerCase();
    }
  }

  // Pattern 2: Count correct statements for "how many" questions
  // Look for patterns like "only II and III", "I, II and III", "all three", "none"
  const countPatterns = [
    { pattern: /\b(?:only|just)\s+(?:one|I)\b.*correct/i, answer: "a" },
    { pattern: /\b(?:only\s+)?(?:two|I\s+and\s+II|II\s+and\s+III|I\s+and\s+III)\b.*correct/i, answer: "b" },
    { pattern: /\b(?:all\s+(?:three|the\s+three)|I,?\s*II\s*(?:and|,)?\s*III)\b.*correct/i, answer: "c" },
    { pattern: /\bnone\s+(?:of\s+them\s+)?(?:is|are)\s+correct/i, answer: "d" },
    { pattern: /\ball\s+(?:are|statements\s+are)\s+(?:in)?correct/i, answer: "d" },
  ];

  for (const { pattern, answer } of countPatterns) {
    if (pattern.test(text)) {
      return answer;
    }
  }

  // Pattern 3: Check for statement correctness analysis
  const statementAnalysis = analyzeStatements(text);
  if (statementAnalysis) {
    return statementAnalysis;
  }

  // Pattern 4: Look for option letter at end of text
  const endPatterns = [
    /\b([abcd])\s*[.!?\n]*$/i,
    /\(([abcd])\)\s*[.!?\n]*$/i,
  ];

  for (const pattern of endPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].toLowerCase();
    }
  }

  // Pattern 5: Find first standalone option letter
  const standaloneMatch = text.match(/\b([abcd])\b/i);
  if (standaloneMatch) {
    return standaloneMatch[1].toLowerCase();
  }

  return null;
}

// Analyze statement correctness patterns
function analyzeStatements(text: string): string | null {
  const lowerText = text.toLowerCase();

  // Count how many statements are marked as correct/true/false
  let correctCount = 0;
  let totalStatements = 0;

  // Check for individual statement analysis
  const statementPatterns = [
    /statement\s+(?:i|1)\s+is\s+(correct|true|incorrect|false)/gi,
    /statement\s+(?:ii|2)\s+is\s+(correct|true|incorrect|false)/gi,
    /statement\s+(?:iii|3)\s+is\s+(correct|true|incorrect|false)/gi,
    /\bi\s+is\s+(correct|true|incorrect|false)/gi,
    /\bii\s+is\s+(correct|true|incorrect|false)/gi,
    /\biii\s+is\s+(correct|true|incorrect|false)/gi,
  ];

  const correctTerms = ["correct", "true"];

  for (const pattern of statementPatterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      totalStatements++;
      if (correctTerms.includes(match[1].toLowerCase())) {
        correctCount++;
      }
    }
  }

  // If we found statement analysis, map to answer
  if (totalStatements >= 2) {
    if (correctCount === 0) return "d"; // none
    if (correctCount === 1) return "a"; // only one
    if (correctCount === 2) return "b"; // only two
    if (correctCount >= 3) return "c"; // all three or more
  }

  return null;
}

let client: OpenAI | null = null;
let deploymentName: string = "";
let debugMode: boolean = false;

export function initializeLLM(config: Config, debug: boolean = false): void {
  debugMode = debug;

  // The endpoint already includes /v1/, so use it as-is
  let baseURL = config.endpoint;

  // Remove trailing slash if present for clean URL construction
  if (baseURL.endsWith("/")) {
    baseURL = baseURL.slice(0, -1);
  }

  client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: baseURL,
  });

  deploymentName = config.deploymentName;

  if (debugMode) {
    console.log(`[LLM] Initialized with baseURL: ${baseURL}, model: ${deploymentName}`);
  }
}

export async function askLLM(
  question: Question,
  searchResults: string
): Promise<LLMResponse> {
  if (!client) {
    throw new Error("LLM client not initialized. Call initializeLLM first.");
  }

  const systemPrompt = `You answer multiple choice questions. Output format: single letter a, b, c, or d.`;

  const optionsText = Object.entries(question.options)
    .map(([key, value]) => `${key}) ${value}`)
    .join("\n");

  const userPrompt = `Context from web search:
${searchResults}

Question: ${question.question}

Options:
${optionsText}

Reply with just the letter (a, b, c, or d):`;

  try {
    const response = await client.chat.completions.create({
      model: deploymentName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 100,
      temperature: 0.1,
    });

    if (debugMode) {
      console.log(`[LLM] Q${question.id} response:`, JSON.stringify(response.choices[0], null, 2));
    }

    const message = response.choices[0]?.message as Record<string, unknown>;
    // Try content first, then reasoning_content (some models put answer there)
    let rawContent = (message?.content as string) || "";

    // If content is empty, check reasoning_content field
    if (!rawContent && message?.reasoning_content) {
      rawContent = message.reasoning_content as string;
    }

    const answer = rawContent.trim().toLowerCase();

    // Try to extract the answer letter
    let validAnswer: string | null = null;
    if (["a", "b", "c", "d"].includes(answer)) {
      validAnswer = answer;
    } else {
      // Extract answer from verbose reasoning
      validAnswer = extractAnswerFromReasoning(rawContent);
    }

    return {
      answer: validAnswer || rawContent,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
    };
  } catch (error) {
    if (debugMode) {
      console.error(`[LLM] Q${question.id} error:`, error);
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`LLM request failed: ${errorMessage}`);
  }
}

export function getLLMClient(): OpenAI | null {
  return client;
}

// ============ ADVANCED LLM INTERFACE ============

export interface LLMCallOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMCallResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
}

// Generic LLM call for any agent
export async function callLLM(options: LLMCallOptions): Promise<LLMCallResult> {
  if (!client) {
    throw new Error("LLM client not initialized. Call initializeLLM first.");
  }

  const { systemPrompt, userPrompt, temperature = 0.1, maxTokens = 2000 } = options;

  try {
    const response = await client.chat.completions.create({
      model: deploymentName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature,
    });

    const message = response.choices[0]?.message as Record<string, unknown>;
    let content = (message?.content as string) || "";

    // If content is empty, check reasoning_content field
    if (!content && message?.reasoning_content) {
      content = message.reasoning_content as string;
    }

    return {
      content: content.trim(),
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`LLM call failed: ${errorMessage}`);
  }
}

// Extract answer from reasoner output (JSON first, then regex fallback)
export function extractFinalAnswer(text: string): { answer: string | null; confidence: string } {
  // Try JSON parse first (preferred)
  const json = parseJSONFromLLM(text);
  if (json && json.answer) {
    const answer = String(json.answer).toLowerCase();
    if (["a", "b", "c", "d"].includes(answer)) {
      return {
        answer,
        confidence: String(json.confidence || "medium").toLowerCase(),
      };
    }
  }

  // Fallback: Look for FINAL_ANSWER pattern
  const answerMatch = text.match(/FINAL_ANSWER:\s*\[?([abcd])\]?/i);
  const confidenceMatch = text.match(/CONFIDENCE:\s*\[?(HIGH|MEDIUM|LOW)\]?/i);

  let answer: string | null = null;
  if (answerMatch) {
    answer = answerMatch[1].toLowerCase();
  } else {
    // Final fallback to general extraction
    answer = extractAnswerFromReasoning(text);
  }

  const confidence = confidenceMatch ? confidenceMatch[1].toLowerCase() : "medium";

  return { answer, confidence };
}

// Extract verdict from verifier output (JSON first, then regex fallback)
export function extractVerdict(text: string): {
  verdict: "confirm" | "challenge" | "uncertain";
  alternative: string | null;
} {
  // Try JSON parse first (preferred)
  const json = parseJSONFromLLM(text);
  if (json && json.verdict) {
    const verdict = String(json.verdict).toLowerCase();
    if (["confirm", "challenge", "uncertain"].includes(verdict)) {
      return {
        verdict: verdict as "confirm" | "challenge" | "uncertain",
        alternative: json.alternative ? String(json.alternative).toLowerCase() : null,
      };
    }
  }

  // Fallback: Look for VERDICT pattern
  const verdictMatch = text.match(/VERDICT:\s*\[?(CONFIRM|CHALLENGE|UNCERTAIN)\]?/i);
  const altMatch = text.match(/ALTERNATIVE:\s*\[?([abcd])\]?/i);

  return {
    verdict: (verdictMatch?.[1]?.toLowerCase() || "uncertain") as "confirm" | "challenge" | "uncertain",
    alternative: altMatch?.[1]?.toLowerCase() || null,
  };
}

// Parse JSON from LLM output (for analyzer)
export function parseJSONFromLLM(text: string): Record<string, unknown> | null {
  // Try to extract JSON from the text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// Parse search queries from LLM output
export function parseSearchQueries(text: string): string[] {
  const queries: string[] = [];
  const pattern = /QUERY_\d:\s*(.+)/gi;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const query = match[1].trim();
    if (query && query.length > 5) {
      queries.push(query);
    }
  }

  return queries.length > 0 ? queries : [];
}
