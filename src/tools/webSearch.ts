import type { SerperResponse, SerperSearchResult, Question } from "../types.js";

let serperApiKey: string = "";
let apiCallCount: number = 0;

export function initializeWebSearch(apiKey: string): void {
  serperApiKey = apiKey;
  apiCallCount = 0;
}

export function getApiCallCount(): number {
  return apiCallCount;
}

export function resetApiCallCount(): void {
  apiCallCount = 0;
}

// Extract key terms from question for search query
function generateSearchQuery(question: Question): string {
  // Remove common question patterns and clean up
  let queryText = question.question
    .replace(/Consider the following.*?:/gi, "")
    .replace(/With reference to.*?,/gi, "")
    .replace(/How many of the (above|statements|following).*?\?/gi, "")
    .replace(/Which of the (statements|following).*?\?/gi, "")
    .replace(/Statement [IVX]+:/gi, "")
    .replace(/[IVX]+\.\s*/g, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Limit query length for better search results
  if (queryText.length > 200) {
    queryText = queryText.substring(0, 200);
  }

  // Add UPSC context for better results
  return `${queryText} UPSC facts`;
}

export async function searchWeb(question: Question): Promise<{
  query: string;
  results: string;
  resultCount: number;
}> {
  if (!serperApiKey) {
    throw new Error("Serper API key not initialized. Call initializeWebSearch first.");
  }

  const query = generateSearchQuery(question);

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": serperApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: 5, // Get top 5 results
      }),
    });

    if (!response.ok) {
      throw new Error(`Serper API error: ${response.status} ${response.statusText}`);
    }

    apiCallCount++;

    const data = (await response.json()) as SerperResponse;
    const organicResults = data.organic || [];

    // Format results for LLM consumption
    const formattedResults = formatSearchResults(organicResults);

    return {
      query,
      results: formattedResults,
      resultCount: organicResults.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Return empty results on error but don't fail the whole question
    return {
      query,
      results: `[Search failed: ${errorMessage}]`,
      resultCount: 0,
    };
  }
}

function formatSearchResults(results: SerperSearchResult[]): string {
  if (results.length === 0) {
    return "[No search results found]";
  }

  return results
    .map((result, index) => {
      return `[${index + 1}] ${result.title}
${result.snippet}
Source: ${result.link}`;
    })
    .join("\n\n");
}

// Direct search with raw query (for advanced agents)
export async function searchWithQuery(query: string): Promise<{
  query: string;
  results: string;
  resultCount: number;
}> {
  if (!serperApiKey) {
    throw new Error("Serper API key not initialized. Call initializeWebSearch first.");
  }

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": serperApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: 5,
      }),
    });

    if (!response.ok) {
      throw new Error(`Serper API error: ${response.status} ${response.statusText}`);
    }

    apiCallCount++;

    const data = (await response.json()) as SerperResponse;
    const organicResults = data.organic || [];

    return {
      query,
      results: formatSearchResults(organicResults),
      resultCount: organicResults.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      query,
      results: `[Search failed: ${errorMessage}]`,
      resultCount: 0,
    };
  }
}
