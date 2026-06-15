export type LlmProviderName = "mock" | "openai" | "gemini" | "groq";

export type JsonGenerationRequest = {
  system: string;
  user: string;
  temperature?: number;
  // Used by the mock provider so the LLM-enabled workflow can be exercised
  // without an API key during local development and interviews.
  mockResponse?: unknown;
};

export type TextGenerationRequest = {
  system: string;
  user: string;
  temperature?: number;
  mockResponse?: string;
};

export type LlmClient = {
  provider: LlmProviderName;
  model: string;
  generateJson(request: JsonGenerationRequest): Promise<unknown>;
  generateText(request: TextGenerationRequest): Promise<string>;
};
