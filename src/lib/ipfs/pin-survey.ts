import type { IpfsSurveyJSON } from "./schemas";
import { ipfsSurveySchema } from "./schemas";
import { canonicalize } from "./deterministic-json";
import { pinBlob } from "./pinata";

export type PinSurveyInput = Omit<IpfsSurveyJSON, "version">;

/**
 * Build the canonical IPFS JSON payload for a survey (without pinning).
 */
export function buildSurveyJSON(input: PinSurveyInput): IpfsSurveyJSON {
  const json: IpfsSurveyJSON = {
    version: "1",
    ...input,
  };
  // Validate against the schema
  ipfsSurveySchema.parse(json);
  return json;
}

/**
 * Pin a survey to IPFS. Returns the CID string.
 *
 * Steps: build JSON -> validate with Zod -> canonicalize -> encode to bytes -> pin via pinBlob.
 */
export async function pinSurvey(
  input: PinSurveyInput,
  surveyHash: string,
): Promise<string> {
  const json = buildSurveyJSON(input);
  const canonical = canonicalize(json);
  if (canonical === undefined) {
    throw new Error("Failed to canonicalize survey JSON");
  }
  const bytes = new TextEncoder().encode(canonical);
  const blob = new Blob([bytes], { type: "application/json" });
  return pinBlob(blob, `survey-${surveyHash}.json`);
}
