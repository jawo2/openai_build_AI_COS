import type { AnalyzeRequest, AnalyzeResponse } from "@/lib/types";
import { demoAnalysisResult, demoCreatorProfile } from "./demo-data";

export async function analyzeCreator(
  _request: AnalyzeRequest
): Promise<AnalyzeResponse> {
  return {
    creator: demoCreatorProfile,
    analysis: demoAnalysisResult,
    dataSource: demoAnalysisResult.dataSource
  };
}
