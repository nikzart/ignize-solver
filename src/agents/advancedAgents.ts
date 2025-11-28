import type { Question, Answer } from "../types.js";
import { callLLM, parseJSONFromLLM, extractFinalAnswer } from "../tools/llm.js";
import { searchWithQuery } from "../tools/webSearch.js";

// ============ ENHANCED REASONING PIPELINE ============

const ENHANCED_REASONER_SYSTEM = `You are a UPSC Civil Services expert with deep knowledge of Indian polity, history, geography, economy, science, and current affairs.

Your task is to answer multiple choice questions accurately. Follow this systematic approach:

1. IDENTIFY QUESTION TYPE:
   - "How many are correct" → Count TRUE statements
   - "Which is correct" → Find the TRUE statement
   - "Which is NOT correct" → Find the FALSE statement

2. ANALYZE EACH STATEMENT:
   - Evaluate against the research provided
   - Mark each as TRUE, FALSE, or UNCERTAIN
   - Be skeptical of absolute claims ("all", "none", "always", "never")

3. COUNT CAREFULLY:
   - For counting questions, explicitly count TRUE statements
   - Map the count to the answer option

CRITICAL: Output ONLY valid JSON:
{"answer": "a", "confidence": "high", "reasoning": "Brief explanation"}

Rules:
- answer: exactly one letter a, b, c, or d (lowercase)
- confidence: high, medium, or low (lowercase)
- reasoning: 1-2 sentences`;

function getEnhancedReasonerPrompt(question: Question, research: string, attempt: number): string {
  const optionsText = Object.entries(question.options)
    .map(([k, v]) => `${k}) ${v}`)
    .join("\n");

  const attemptFraming = [
    "Focus on precise fact-checking. Only accept claims clearly supported by evidence.",
    "Consider each statement carefully. Look for subtle distinctions in the research.",
    "Apply rigorous analytical reasoning. Check for common UPSC trap answers.",
    "Be skeptical of 'all' or 'none' answers. Most UPSC questions have nuanced answers.",
    "Final check: verify your count matches the evidence. Be extra careful.",
  ][attempt % 5];

  return `## Research Context
${research}

## Question
${question.question}

## Options
${optionsText}

## Approach (Attempt ${attempt + 1})
${attemptFraming}

STEP-BY-STEP ANALYSIS:

1. What type of question is this?
   - If "how many correct": I will count TRUE statements
   - If "which is correct": I will find the TRUE option
   - If "which is NOT correct": I will find the FALSE option

2. For each statement/option, based on the research:
   - Statement I: TRUE/FALSE/UNCERTAIN (cite evidence)
   - Statement II: TRUE/FALSE/UNCERTAIN (cite evidence)
   - Statement III: TRUE/FALSE/UNCERTAIN (cite evidence)

3. My conclusion:
   - Count of TRUE statements: ___
   - Maps to option: ___

Now output ONLY the JSON answer:`;
}

export async function solvePipeline(
  question: Question,
  correctAnswer: Answer
): Promise<{
  finalAnswer: Answer | null;
  isCorrect: boolean;
  confidence: string;
  llmCalls: number;
  serperCalls: number;
  totalTokens: number;
}> {
  let llmCalls = 0;
  let serperCalls = 0;
  let totalTokens = 0;

  try {
    // ===== STEP 1: COMPREHENSIVE RESEARCH =====
    const searchQueries = [
      question.question.slice(0, 120) + " facts",
      extractKeyTerms(question.question) + " UPSC India",
      question.question.slice(0, 80) + " official government",
    ];

    const searchPromises = searchQueries.map((q) =>
      searchWithQuery(q).catch(() => ({
        query: q,
        results: "[Search failed]",
        resultCount: 0,
      }))
    );
    const searchResults = await Promise.all(searchPromises);
    serperCalls += searchResults.length;

    const combinedResearch = searchResults
      .map((sr) => `### ${sr.query.slice(0, 40)}...\n${sr.results}`)
      .join("\n\n---\n\n");

    // ===== STEP 2: MULTI-ATTEMPT VOTING (5 attempts - optimal) =====
    const votes: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
    const reasonings: string[] = [];

    // Run 5 reasoning attempts in parallel
    const reasoningPromises = [0, 1, 2, 3, 4].map((attempt) =>
      callLLM({
        systemPrompt: ENHANCED_REASONER_SYSTEM,
        userPrompt: getEnhancedReasonerPrompt(question, combinedResearch, attempt),
        temperature: [0.1, 0.15, 0.2, 0.3, 0.4][attempt], // Lower temps for precision
        maxTokens: 1000,
      })
    );

    const reasoningResults = await Promise.all(reasoningPromises);
    llmCalls += 5;

    for (const r of reasoningResults) {
      totalTokens += r.promptTokens + r.completionTokens;

      // Try JSON extraction first
      const parsed = parseJSONFromLLM(r.content);
      let answer: string | null = null;

      if (parsed && parsed.answer) {
        answer = String(parsed.answer).toLowerCase();
      } else {
        // Fallback to pattern extraction
        const extracted = extractFinalAnswer(r.content);
        answer = extracted.answer;
      }

      if (answer && votes.hasOwnProperty(answer)) {
        votes[answer]++;
        reasonings.push(r.content);
      }
    }

    // Find winner
    const sortedVotes = Object.entries(votes)
      .map(([ans, count]) => ({ answer: ans as Answer, count }))
      .sort((a, b) => b.count - a.count);

    let finalAnswer = sortedVotes[0].answer;
    let confidence: string;

    if (sortedVotes[0].count >= 4) {
      confidence = "high"; // 4/5 or 5/5 agree
    } else if (sortedVotes[0].count >= 3) {
      confidence = "high"; // 3/5 majority
    } else {
      confidence = "medium"; // No strong consensus
    }

    return {
      finalAnswer,
      isCorrect: finalAnswer === correctAnswer,
      confidence,
      llmCalls,
      serperCalls,
      totalTokens,
    };
  } catch (error) {
    return {
      finalAnswer: null,
      isCorrect: false,
      confidence: "low",
      llmCalls,
      serperCalls,
      totalTokens,
    };
  }
}

// Helper function to extract key terms from question
function extractKeyTerms(text: string): string {
  // Remove common question patterns
  let cleaned = text
    .replace(/Consider the following.*?:/gi, "")
    .replace(/With reference to.*?,/gi, "")
    .replace(/How many of the.*?\?/gi, "")
    .replace(/Which of the.*?\?/gi, "")
    .replace(/Statement [IVX]+:/gi, "")
    .replace(/[IVX]+\.\s*/g, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Take first 100 chars of meaningful content
  return cleaned.slice(0, 100);
}
