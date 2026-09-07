/**
 * JSON repair, isolated so the validator and formatter do not download it.
 *
 * jsonrepair is what actually does the work: trailing commas, comments,
 * single quotes, unquoted keys, Python True/False/None, truncated documents.
 * After it runs, the result is parsed with JSON.parse so a "repaired" string
 * that is still not JSON cannot leave this module.
 */
import { JSONRepairError, jsonrepair } from 'jsonrepair';
import { formatJson, parseJson, type JsonIndent } from './json';

export interface JsonRepairResult {
  readonly repaired: string;
  readonly formatted: string;
  /** True when JSON.parse already accepted the input; repair was a no-op. */
  readonly alreadyValid: boolean;
}

export function repairJson(text: string, indent: JsonIndent = 2): JsonRepairResult {
  const parsed = parseJson(text);
  if (parsed.ok) {
    return {
      repaired: text,
      formatted: formatJson(text, { indent }),
      alreadyValid: true,
    };
  }

  let raw: string;
  try {
    raw = jsonrepair(text);
  } catch (error) {
    if (error instanceof JSONRepairError) {
      const where = typeof error.position === 'number' ? ` at position ${error.position}` : '';
      throw new Error(`Could not repair this JSON${where}: ${error.message}`);
    }
    throw error;
  }

  const check = parseJson(raw);
  if (!check.ok) {
    throw new Error(`Repair produced something JSON.parse still rejects: ${check.error.message}`);
  }

  return {
    repaired: raw,
    formatted: formatJson(raw, { indent }),
    alreadyValid: false,
  };
}
