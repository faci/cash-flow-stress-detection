import type { AnalyseResponse } from "../domain/types.js";

export class AnalyseService {
  analyse(_csvContent: string): AnalyseResponse {
    throw new Error("Not implemented");
  }
}
