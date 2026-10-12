/** Normalizes RFC Problem Details responses at browser boundaries. */

import { z } from "zod";
import { LodeonClientError } from "./client-error";

type ProblemPayload = {
  code?: string;
  detail?: string;
  error?: string;
};

const problemPayloadSchema = z
  .object({ code: z.string().optional(), detail: z.string().optional(), error: z.string().optional() })
  .passthrough();

/** Parses an HTTP failure into the stable client-error contract without trusting remote prose. */
export async function problemFromResponse(
  response: Response,
  fallbackCode: string,
  statusCodeMap: Record<number, string> = {}
): Promise<LodeonClientError> {
  const code = statusCodeMap[response.status] ?? fallbackCode;
  const payload = await readProblemPayload(response);
  const problemCode = payload.code || code;
  const externalError = payload.error ?? payload.detail ?? String(response.status);

  return new LodeonClientError(problemCode, { externalError });
}

async function readProblemPayload(response: Response): Promise<ProblemPayload> {
  const body = await response.text();

  if (!body) {
    return {};
  }

  try {
    const parsed = problemPayloadSchema.safeParse(JSON.parse(body) as unknown);
    return parsed.success ? parsed.data : { detail: body };
  } catch {
    return { detail: body };
  }
}
