// Question structure from questions.json
export interface Question {
  id: number;
  question: string;
  options: {
    a: string;
    b: string;
    c: string;
    d: string;
  };
}

// Answer key structure from answers.json
export interface AnswerKey {
  [questionId: string]: "a" | "b" | "c" | "d";
}

// Result from solving a single question
export interface QuestionResult {
  questionId: number;
  selectedAnswer: "a" | "b" | "c" | "d" | null;
  correctAnswer: "a" | "b" | "c" | "d";
  isCorrect: boolean;
  searchQuery: string;
  searchResultsCount: number;
  promptTokens: number;
  completionTokens: number;
  timeMs: number;
  error?: string;
}

// Batch processing result
export interface BatchResult {
  batchNumber: number;
  results: QuestionResult[];
  totalTimeMs: number;
  correctCount: number;
  totalQuestions: number;
  accuracy: number;
}

// Overall metrics
export interface Metrics {
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
  totalTimeMs: number;
  avgTimePerQuestion: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  serperApiCalls: number;
  llmCalls: number;
  batchResults: BatchResult[];
}

// Serper API response structure
export interface SerperSearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

export interface SerperResponse {
  organic: SerperSearchResult[];
  searchParameters?: {
    q: string;
  };
}

// LLM completion response with usage
export interface LLMResponse {
  answer: string;
  promptTokens: number;
  completionTokens: number;
}

// Environment configuration
export interface Config {
  endpoint: string;
  modelName: string;
  deploymentName: string;
  apiKey: string;
  serperApiKey: string;
}

// ============ ADVANCED AGENTIC FRAMEWORK TYPES ============

// Answer type
export type Answer = "a" | "b" | "c" | "d";

// Analyzer Agent Output
export interface AnalyzerOutput {
  questionType: "factual" | "analytical" | "comparative" | "current_affairs";
  mainTopic: string;
  entities: string[];
  statements: string[];
  keyTerms: string[];
  searchQueries: string[];
}

// Research Output
export interface ResearchOutput {
  queries: string[];
  searchResults: SerperSearchResult[][];
  compiledResearch: string;
  verifiedFacts: string[];
  sourceCount: number;
}

// Reasoner Output
export interface ReasonerOutput {
  answer: Answer | null;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  statementAnalysis?: {
    statement: string;
    assessment: "true" | "false" | "uncertain";
    evidence: string;
  }[];
}

// Voter Output
export interface VoterOutput {
  answer: Answer;
  confidence: "high" | "medium" | "low";
  votes: { answer: Answer; count: number }[];
  attempts: number;
  consensusStrength: number; // percentage of votes for winner
}

// Verifier Output
export interface VerifierOutput {
  verdict: "confirm" | "challenge" | "uncertain";
  originalAnswer: Answer;
  suggestedAnswer?: Answer;
  evidenceCheck: string;
  logicCheck: string;
  confidence: "high" | "medium" | "low";
}

// Complete Pipeline Result
export interface PipelineResult {
  questionId: number;
  finalAnswer: Answer | null;
  correctAnswer: Answer;
  isCorrect: boolean;
  confidence: "high" | "medium" | "low";

  // Stage outputs
  analysis?: AnalyzerOutput;
  research?: ResearchOutput;
  reasoning?: ReasonerOutput;
  voting?: VoterOutput;
  verification?: VerifierOutput;

  // Metrics
  llmCalls: number;
  serperCalls: number;
  totalTokens: number;
  timeMs: number;
  error?: string;
}

// Extended Metrics
export interface AdvancedMetrics extends Metrics {
  avgLlmCallsPerQuestion: number;
  avgSerperCallsPerQuestion: number;
  confidenceBreakdown: {
    high: number;
    medium: number;
    low: number;
  };
  verifierOverrides: number;
  tieBreakersNeeded: number;
}
