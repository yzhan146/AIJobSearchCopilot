import type {
  JsonGenerationRequest,
  LlmClient,
  LlmProviderName,
  TextGenerationRequest
} from "./client.js";
import { extractJsonObject } from "./json.js";
import { configureHttpProxy } from "./proxy.js";

export function createLlmClient(providerName?: string): LlmClient | undefined {
  const provider = normalizeProvider(providerName ?? process.env.LLM_PROVIDER);

  if (!provider) {
    return undefined;
  }

  configureHttpProxy();

  if (provider === "mock") {
    return new MockLlmClient();
  }

  if (provider === "gemini") {
    return new GeminiLlmClient({
      apiKey: readRequiredEnv("GEMINI_API_KEY", "GOOGLE_API_KEY"),
      model: process.env.GEMINI_MODEL ?? "gemini-1.5-flash"
    });
  }

  if (provider === "groq") {
    return new OpenAiCompatibleLlmClient({
      provider: "groq",
      apiKey: readRequiredEnv("GROQ_API_KEY"),
      model: process.env.GROQ_MODEL ?? "llama-3.1-8b-instant",
      endpoint: "https://api.groq.com/openai/v1/chat/completions"
    });
  }

  if (provider === "deepseek") {
    return new OpenAiCompatibleLlmClient({
      provider: "deepseek",
      apiKey: readRequiredEnv("DEEPSEEK_API_KEY"),
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      endpoint: process.env.DEEPSEEK_ENDPOINT ?? "https://api.deepseek.com/v1/chat/completions"
    });
  }

  return new OpenAiLlmClient({
    apiKey: readRequiredEnv("OPENAI_API_KEY"),
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini"
  });
}

function normalizeProvider(providerName?: string): LlmProviderName | undefined {
  const normalized = providerName?.trim().toLowerCase();

  if (!normalized || normalized === "none" || normalized === "false") {
    return undefined;
  }

  if (
    normalized === "mock" ||
    normalized === "openai" ||
    normalized === "gemini" ||
    normalized === "groq" ||
    normalized === "deepseek"
  ) {
    return normalized;
  }

  throw new Error(`Unsupported LLM provider: ${providerName}`);
}

function readRequiredEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

class MockLlmClient implements LlmClient {
  provider: LlmProviderName = "mock";
  model = "mock-local";

  async generateJson(request: JsonGenerationRequest): Promise<unknown> {
    if (request.mockResponse === undefined) {
      throw new Error("Mock LLM JSON request requires mockResponse.");
    }
    return request.mockResponse;
  }

  async generateText(request: TextGenerationRequest): Promise<string> {
    if (request.mockResponse === undefined) {
      throw new Error("Mock LLM text request requires mockResponse.");
    }
    return request.mockResponse;
  }
}

class OpenAiLlmClient implements LlmClient {
  provider: LlmProviderName = "openai";
  model: string;
  private readonly apiKey: string;

  constructor(options: { apiKey: string; model: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  async generateJson(request: JsonGenerationRequest): Promise<unknown> {
    const content = await this.createChatCompletion(request, "json_object");
    return extractJsonObject(content);
  }

  async generateText(request: TextGenerationRequest): Promise<string> {
    return this.createChatCompletion(request);
  }

  private async createChatCompletion(
    request: JsonGenerationRequest | TextGenerationRequest,
    responseFormat?: "json_object"
  ): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        temperature: request.temperature ?? 0.2,
        ...(responseFormat ? { response_format: { type: responseFormat } } : {}),
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI request failed (${response.status}): ${errorBody}`);
    }

    const payload: unknown = await response.json();
    return readAssistantMessage(payload, "openai");
  }
}

class OpenAiCompatibleLlmClient implements LlmClient {
  provider: LlmProviderName;
  model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;

  constructor(options: {
    provider: LlmProviderName;
    apiKey: string;
    model: string;
    endpoint: string;
  }) {
    this.provider = options.provider;
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.endpoint = options.endpoint;
  }

  async generateJson(request: JsonGenerationRequest): Promise<unknown> {
    const content = await this.createChatCompletion(request, true);
    return extractJsonObject(content);
  }

  async generateText(request: TextGenerationRequest): Promise<string> {
    return this.createChatCompletion(request, false);
  }

  private async createChatCompletion(
    request: JsonGenerationRequest | TextGenerationRequest,
    jsonMode: boolean
  ): Promise<string> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        temperature: request.temperature ?? 0.2,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`${this.provider} request failed (${response.status}): ${errorBody}`);
    }

    const payload: unknown = await response.json();
    return readAssistantMessage(payload, this.provider);
  }
}

class GeminiLlmClient implements LlmClient {
  provider: LlmProviderName = "gemini";
  model: string;
  private readonly apiKey: string;

  constructor(options: { apiKey: string; model: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  async generateJson(request: JsonGenerationRequest): Promise<unknown> {
    const content = await this.generateContent(request, "application/json");
    return extractJsonObject(content);
  }

  async generateText(request: TextGenerationRequest): Promise<string> {
    return this.generateContent(request);
  }

  private async generateContent(
    request: JsonGenerationRequest | TextGenerationRequest,
    responseMimeType?: "application/json"
  ): Promise<string> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model
    )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${request.system}\n\n${request.user}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: request.temperature ?? 0.2,
          ...(responseMimeType ? { responseMimeType } : {})
        }
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${errorBody}`);
    }

    const payload: unknown = await response.json();
    return readGeminiText(payload);
  }
}

function readGeminiText(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new Error("Gemini response must be an object.");
  }

  const candidates = payload.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("Gemini response did not include candidates.");
  }

  const firstCandidate = candidates[0];
  if (!isRecord(firstCandidate) || !isRecord(firstCandidate.content)) {
    throw new Error("Gemini candidate did not include content.");
  }

  const parts = firstCandidate.content.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error("Gemini response content did not include parts.");
  }

  const textParts = parts
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .filter(Boolean);

  if (textParts.length === 0) {
    throw new Error("Gemini response did not include text.");
  }

  return textParts.join("\n");
}

function readAssistantMessage(payload: unknown, providerName: string): string {
  if (!isRecord(payload)) {
    throw new Error(`${providerName} response must be an object.`);
  }

  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error(`${providerName} response did not include choices.`);
  }

  const firstChoice = choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new Error(`${providerName} response choice did not include a message.`);
  }

  const content = firstChoice.message.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error(`${providerName} response message content was empty.`);
  }

  return content;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
