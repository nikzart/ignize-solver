import type { Question } from "../types.js";

// ============ ANALYZER PROMPTS ============

export const ANALYZER_SYSTEM = `You are a UPSC question analyzer. Your job is to understand and decompose questions for better answering.

Analyze the question and extract:
1. Question type (factual, analytical, comparative, current_affairs)
2. Main topic and key entities
3. Individual statements to verify (if applicable)
4. Optimal search queries

Output MUST be valid JSON.`;

export function getAnalyzerPrompt(question: Question): string {
  const optionsText = Object.entries(question.options)
    .map(([k, v]) => `${k}) ${v}`)
    .join("\n");

  return `Analyze this UPSC question:

Question: ${question.question}

Options:
${optionsText}

Provide your analysis as JSON with this exact structure:
{
  "questionType": "factual" | "analytical" | "comparative" | "current_affairs",
  "mainTopic": "primary subject area",
  "entities": ["list of specific names, acts, organizations, places"],
  "statements": ["if multiple statements in question, list each separately"],
  "keyTerms": ["technical terms that need verification"],
  "searchQueries": ["query1", "query2", "query3"]
}

For searchQueries:
- Query 1: Broad query about main topic
- Query 2: Specific query for key entities/facts
- Query 3: Query for official/authoritative sources

Output only the JSON, no other text.`;
}

// ============ QUERY GENERATOR PROMPTS ============

export const QUERY_GENERATOR_SYSTEM = `You are a research assistant specializing in generating optimal web search queries for UPSC exam questions.

Your queries should:
1. Be concise but specific
2. Target authoritative sources (government, academic)
3. Include relevant keywords for accurate results
4. Avoid question phrasing, use declarative search terms`;

export function getQueryGeneratorPrompt(
  question: Question,
  entities: string[],
  statements: string[]
): string {
  return `Generate 3 optimal search queries for this UPSC question.

Question: ${question.question}

Identified Entities: ${entities.join(", ") || "None"}
Statements to Verify: ${statements.join("; ") || "None"}

Generate 3 search queries that will help find accurate information:

Output format (one query per line, no numbering):
QUERY_1: [search query text]
QUERY_2: [search query text]
QUERY_3: [search query text]

Make queries specific and fact-focused, not question-formatted.`;
}

// ============ RESEARCH COMPILER PROMPTS ============

export const RESEARCH_COMPILER_SYSTEM = `You are a research compiler. Your job is to extract and organize relevant facts from search results to help answer a UPSC question.

Be concise but comprehensive. Focus on facts that directly help answer the question.`;

export function getResearchCompilerPrompt(
  question: Question,
  searchResults: string,
  statements: string[]
): string {
  return `Compile research findings for this UPSC question.

Question: ${question.question}

${statements.length > 0 ? `Statements to Verify:\n${statements.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : ""}

Search Results:
${searchResults}

Extract and organize:

VERIFIED_FACTS:
- List facts confirmed by the search results

KEY_INFORMATION:
- Relevant details for answering the question

STATEMENT_ANALYSIS (if applicable):
- For each statement, note if search results support or contradict it

Be concise and factual.`;
}

// ============ REASONER PROMPTS ============

export const REASONER_SYSTEM = `You are a UPSC Civil Services expert. Use systematic reasoning to answer multiple choice questions.

CRITICAL: You MUST output your answer as valid JSON in this exact format:
{
  "answer": "a",
  "confidence": "high",
  "reasoning": "Brief explanation of why this answer is correct"
}

Rules:
- "answer" must be exactly one letter: a, b, c, or d (lowercase)
- "confidence" must be: "high", "medium", or "low" (lowercase)
- "reasoning" should be 1-2 sentences explaining your answer

Output ONLY the JSON object. No other text before or after.`;

export function getReasonerPrompt(
  question: Question,
  research: string,
  focus: string = "balanced"
): string {
  const optionsText = Object.entries(question.options)
    .map(([k, v]) => `${k}) ${v}`)
    .join("\n");

  const focusInstruction = {
    precision: "Focus on precise fact-checking. Only accept well-supported claims.",
    balanced: "Balance evidence with reasoning. Consider multiple perspectives.",
    creative: "Consider creative interpretations while staying factual.",
    analytical: "Apply rigorous analytical reasoning to each statement.",
    evidence: "Prioritize evidence from search results. Quote specific sources.",
  }[focus] || "";

  return `## Research Context
${research}

## Question
${question.question}

## Options
${optionsText}

## Instructions
${focusInstruction}

Analyze this question systematically:
1. What is the question asking?
2. Evaluate each option against the research
3. For "how many correct" questions: Count TRUE statements
4. For "which is correct" questions: Select the verified option
5. For "which is NOT correct" questions: Find the FALSE statement

Now output your answer as JSON:
{"answer": "X", "confidence": "Y", "reasoning": "Z"}

Replace X with a/b/c/d, Y with high/medium/low, Z with your explanation.`;
}

// ============ VERIFIER PROMPTS ============

export const VERIFIER_SYSTEM = `You are a critical reviewer for UPSC answers. Your job is to validate or challenge proposed answers.

CRITICAL: You MUST output your verdict as valid JSON in this exact format:
{
  "verdict": "confirm",
  "alternative": null,
  "reason": "Brief explanation of your assessment"
}

Rules:
- "verdict" must be exactly one of: "confirm", "challenge", or "uncertain" (lowercase)
- "alternative" must be a letter (a/b/c/d) if verdict is "challenge", otherwise null
- "reason" should be 1-2 sentences explaining your verdict

Output ONLY the JSON object. No other text before or after.`;

export function getVerifierPrompt(
  question: Question,
  proposedAnswer: string,
  reasoning: string,
  research: string
): string {
  const optionsText = Object.entries(question.options)
    .map(([k, v]) => `${k}) ${v}`)
    .join("\n");

  return `## Question
${question.question}

## Options
${optionsText}

## Proposed Answer: ${proposedAnswer}

## Reasoning Given:
${reasoning}

## Research Available:
${research}

## Your Task
Critically evaluate this answer:
1. Is answer "${proposedAnswer}" supported by the research?
2. Is the reasoning sound or are there logical errors?
3. Could another answer be more correct?

Based on your evaluation, output your verdict as JSON:
{"verdict": "X", "alternative": Y, "reason": "Z"}

Where X is confirm/challenge/uncertain, Y is the alternative letter or null, Z is your explanation.`;
}

// ============ STATEMENT DECOMPOSER PROMPTS ============

export const DECOMPOSER_SYSTEM = `You are a UPSC question analyzer. Your job is to extract individual statements that need fact-checking.

CRITICAL: Output valid JSON only. No other text.`;

export function getDecomposerPrompt(question: Question): string {
  const optionsText = Object.entries(question.options)
    .map(([k, v]) => `${k}) ${v}`)
    .join("\n");

  return `Analyze this UPSC question and extract each statement that needs verification.

Question: ${question.question}

Options:
${optionsText}

Output JSON with this structure:
{
  "questionType": "count_correct",
  "statements": [
    {
      "id": 1,
      "text": "Full text of statement I",
      "searchQuery": "specific search query to verify this statement"
    }
  ],
  "answerMapping": {
    "0": "d",
    "1": "a",
    "2": "b",
    "3": "c"
  }
}

Rules for questionType:
- "count_correct": Questions asking "how many are correct/true"
- "count_incorrect": Questions asking "how many are incorrect/false"
- "which_correct": Questions asking "which statement(s) is/are correct"
- "which_incorrect": Questions asking "which is NOT correct"
- "factual": Simple factual questions without multiple statements

Rules for answerMapping:
- Map the count of correct statements to the answer letter
- Look at the options to determine the mapping
- Example: if options are "Only one"=a, "Only two"=b, "All three"=c, "None"=d
  Then mapping is: "0":"d", "1":"a", "2":"b", "3":"c"

Rules for searchQuery:
- Make it specific to verify THIS statement only
- Include key entities, names, technical terms
- Use declarative phrasing, not questions`;
}

// ============ FACT VERIFIER PROMPTS ============

export const FACT_VERIFIER_SYSTEM = `You are a fact-checker verifying a single statement for a UPSC exam.

CRITICAL: Output valid JSON only. Determine if the statement is TRUE or FALSE based on evidence.`;

export function getFactVerifierPrompt(
  statementText: string,
  searchResults: string
): string {
  return `Verify this statement using the research results.

STATEMENT: "${statementText}"

RESEARCH RESULTS:
${searchResults}

Determine if this statement is TRUE or FALSE based on the evidence.

Output JSON:
{
  "verdict": "true",
  "confidence": "high",
  "evidence": "Quote or cite specific evidence",
  "reasoning": "Brief explanation"
}

Rules:
- "verdict" must be: "true", "false", or "uncertain" (lowercase)
- "confidence" must be: "high", "medium", or "low" (lowercase)
- Only mark "true" if evidence clearly supports it
- Only mark "false" if evidence clearly contradicts it
- Mark "uncertain" if evidence is ambiguous or missing`;
}

// ============ ANSWER SYNTHESIZER PROMPTS ============

export const SYNTHESIZER_SYSTEM = `You are synthesizing the final answer for a UPSC question based on verified statements.

CRITICAL: Output valid JSON only.`;

export function getSynthesizerPrompt(
  question: Question,
  verificationResults: Array<{
    id: number;
    text: string;
    verdict: string;
    confidence: string;
    evidence: string;
  }>,
  questionType: string,
  answerMapping: Record<string, string>
): string {
  const optionsText = Object.entries(question.options)
    .map(([k, v]) => `${k}) ${v}`)
    .join("\n");

  const verificationsText = verificationResults
    .map((v) => `Statement ${v.id}: "${v.text}"\n  Verdict: ${v.verdict.toUpperCase()} (${v.confidence} confidence)\n  Evidence: ${v.evidence}`)
    .join("\n\n");

  return `Determine the final answer based on the verified statements.

QUESTION: ${question.question}

OPTIONS:
${optionsText}

VERIFICATION RESULTS:
${verificationsText}

QUESTION TYPE: ${questionType}
ANSWER MAPPING: ${JSON.stringify(answerMapping)}

Instructions:
1. Count how many statements are TRUE
2. Use the answer mapping to find the correct option
3. For "count_correct": count TRUE statements, map to answer
4. For "which_correct": find which combination matches a TRUE pattern
5. For "which_incorrect": find the FALSE statement

Output JSON:
{
  "answer": "a",
  "confidence": "high",
  "trueCount": 2,
  "reasoning": "Statements I and III are true (2 correct), mapping to answer (b)"
}`;
}

// ============ HELPER FUNCTIONS ============

export function formatSearchResultsForPrompt(
  results: { title: string; snippet: string; link: string }[][]
): string {
  const allResults = results.flat();
  if (allResults.length === 0) return "[No search results found]";

  return allResults
    .slice(0, 10) // Limit to top 10 results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.link}`
    )
    .join("\n\n");
}
