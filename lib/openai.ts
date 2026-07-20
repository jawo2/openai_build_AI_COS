import OpenAI from "openai";
import type { ZodSchema } from "zod";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

type JsonSchema = {
  [key: string]: unknown;
};

type StructuredResponseOptions<T> = {
  name: string;
  schema: JsonSchema;
  validator: ZodSchema<T>;
  instructions: string;
  input: unknown;
  temperature: number;
};

export async function runStructuredResponse<T>({
  name,
  schema,
  validator,
  instructions,
  input,
  temperature
}: StructuredResponseOptions<T>): Promise<T> {
  const response = await openai.responses.create({
    model: DEFAULT_MODEL,
    instructions,
    input: JSON.stringify(input),
    temperature,
    store: false,
    text: {
      format: {
        type: "json_schema",
        name,
        schema,
        strict: true
      }
    }
  });

  const outputText = response.output_text;

  if (!outputText) {
    throw new Error(`OpenAI response for ${name} did not include output_text.`);
  }

  return validator.parse(JSON.parse(outputText));
}
