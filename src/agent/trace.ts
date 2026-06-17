import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolApprovalPolicy, ToolSideEffectLevel } from "./approvalPolicy.js";

export type ToolCallTraceEntry = {
  tool: string;
  inputSummary: string;
  outputSummary: string;
  durationMs: number;
  success: boolean;
  sideEffectLevel: ToolSideEffectLevel;
  approval: ToolApprovalPolicy;
  actionId?: string;
  error?: string;
};

export type ToolTraceFile = {
  generatedAt: string;
  entries: ToolCallTraceEntry[];
};

export async function writeToolTrace(
  outputDir: string,
  entries: ToolCallTraceEntry[]
): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const tracePath = join(outputDir, "tool-call-trace.json");
  const payload: ToolTraceFile = {
    generatedAt: new Date().toISOString(),
    entries
  };

  await writeFile(tracePath, JSON.stringify(payload, null, 2), "utf8");
  return tracePath;
}
