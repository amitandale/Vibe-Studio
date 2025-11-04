import { z } from "zod";

const CONTRACT_CACHE = new Map<string, Promise<OnboardingContracts>>();

type FetchLike = (input: string, init?: Record<string, unknown>) => Promise<{ ok?: boolean; text: () => Promise<string> }>;

export interface ToolContract<TInput = unknown, TOutput = unknown> {
  name: string;
  summary?: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
}

export interface OnboardingContracts {
  tools: Record<string, ToolContract>;
  raw: unknown;
}

interface SchemaNode {
  type?: string;
  required?: string[];
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  enum?: Array<string | number | boolean>;
  nullable?: boolean;
  additionalProperties?: boolean | SchemaNode;
}

interface ContractYaml {
  tools?: Record<
    string,
    {
      summary?: string;
      input?: SchemaNode;
      output?: SchemaNode;
    }
  >;
}

export async function loadOnboardingContracts(baseUrl?: string, fetchImpl?: FetchLike): Promise<OnboardingContracts> {
  const cacheKey = baseUrl?.replace(/\/$/, "") ?? "__local__";
  const existing = CONTRACT_CACHE.get(cacheKey);
  if (existing) {
    return existing;
  }
  const promise = fetchContracts(cacheKey === "__local__" ? undefined : cacheKey, fetchImpl).catch((error) => {
    CONTRACT_CACHE.delete(cacheKey);
    throw error;
  });
  CONTRACT_CACHE.set(cacheKey, promise);
  return promise;
}

async function fetchContracts(baseUrl?: string, fetchImpl?: FetchLike): Promise<OnboardingContracts> {
  const fetchCandidate = fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (typeof fetchCandidate !== "function") {
    throw new Error("Fetch implementation not available for contract loading");
  }
  const fetchFn: FetchLike = fetchCandidate;
  const endpoints: string[] = [];
  if (baseUrl) {
    endpoints.push(`${baseUrl.replace(/\/$/, "")}/schemas/onboarding.yaml`);
  }
  if (!fetchImpl) {
    if (typeof window !== "undefined") {
      endpoints.push(`/schemas/onboarding.yaml`);
    } else {
      endpoints.push("/schemas/onboarding.yaml");
    }
  }

  let lastError: unknown = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetchFn(endpoint, { cache: "no-store" });
      if (!response.ok) {
        lastError = new Error(`Unable to load onboarding contracts (${response.status})`);
        continue;
      }
      const source = await response.text();
      const parsed = parseSimpleYaml(source) as ContractYaml;
      if (!parsed?.tools || Object.keys(parsed.tools).length === 0) {
        throw new Error("Onboarding contracts missing tool definitions");
      }
      const tools: Record<string, ToolContract> = {};
      for (const [name, definition] of Object.entries(parsed.tools)) {
        if (!definition?.input || !definition?.output) {
          continue;
        }
        const inputSchema = buildZodSchema(definition.input, [name, "input"]);
        const outputSchema = buildZodSchema(definition.output, [name, "output"]);
        tools[name] = {
          name,
          summary: definition.summary,
          inputSchema,
          outputSchema,
        } satisfies ToolContract;
      }
      if (Object.keys(tools).length === 0) {
        throw new Error("No onboarding tool contracts were generated");
      }
      return { tools, raw: parsed };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(lastError ? String(lastError) : "Unable to load onboarding contracts");
}

function buildZodSchema(definition: SchemaNode | undefined, path: string[]): z.ZodTypeAny {
  if (!definition) {
    return z.unknown();
  }
  const type = definition.type ?? "object";
  let schema: z.ZodTypeAny;
  switch (type) {
    case "string":
      schema = buildStringSchema(definition);
      break;
    case "number":
      schema = z.number();
      break;
    case "integer":
      schema = z.number().int();
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "array": {
      const items = buildZodSchema(definition.items, [...path, "items"]);
      schema = z.array(items);
      break;
    }
    case "object": {
      const properties = definition.properties ?? {};
      const required = new Set(definition.required ?? []);
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, property] of Object.entries(properties)) {
        let propertySchema = buildZodSchema(property, [...path, key]);
        if (!required.has(key)) {
          propertySchema = propertySchema.optional();
        }
        shape[key] = propertySchema;
      }
      schema = z.object(shape, { description: path.join(".") });
      if (definition.additionalProperties === false) {
        schema = schema.strict();
      } else if (definition.additionalProperties === true || definition.additionalProperties === undefined) {
        schema = schema.catchall(z.unknown());
      } else {
        schema = schema.catchall(buildZodSchema(definition.additionalProperties, [...path, "*"]));
      }
      break;
    }
    default:
      schema = z.unknown();
      break;
  }
  if (definition.nullable) {
    schema = schema.nullable();
  }
  return schema;
}

function buildStringSchema(definition: SchemaNode): z.ZodTypeAny {
  if (definition.enum && definition.enum.length > 0) {
    const values = definition.enum.map((value) => String(value));
    if (values.length === 1) {
      return z.literal(values[0]);
    }
    return z.enum([values[0], ...values.slice(1)] as [string, ...string[]]);
  }
  return z.string();
}

interface TokenizedLine {
  indent: number;
  content: string;
}

function parseSimpleYaml(source: string): unknown {
  const normalized = source.replace(/\r\n?/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/\t/g, "  "))
    .map((line) => line.replace(/#.*$/, ""));

  const tokens: TokenizedLine[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    const indent = line.match(/^ */)?.[0].length ?? 0;
    tokens.push({ indent, content: line.trim() });
  }

  let index = 0;

  const parseBlock = (currentIndent: number): unknown => {
    const map: Record<string, unknown> = {};
    const arr: unknown[] = [];
    let isArray = false;

    while (index < tokens.length) {
      const token = tokens[index];
      if (token.indent < currentIndent) {
        break;
      }
      if (token.indent > currentIndent) {
        throw new Error(`Invalid indentation at line ${index + 1}`);
      }

      const line = token.content;
      if (line.startsWith("- ")) {
        isArray = true;
        index += 1;
        const value = line.slice(2).trim();
        if (!value) {
          arr.push(parseBlock(currentIndent + 2));
        } else {
          const scalar = parseScalar(value);
          if (scalar !== undefined) {
            arr.push(scalar);
          } else {
            arr.push(parseBlock(currentIndent + 2));
          }
        }
        continue;
      }

      const separator = line.indexOf(":");
      if (separator === -1) {
        throw new Error(`Invalid YAML entry: ${line}`);
      }
      const key = line.slice(0, separator).trim();
      const remainder = line.slice(separator + 1).trim();
      index += 1;
      if (!remainder) {
        map[key] = parseBlock(currentIndent + 2);
      } else if (remainder === "|" || remainder === ">") {
        map[key] = parseMultilineString(currentIndent + 2, remainder === ">");
      } else {
        const scalar = parseScalar(remainder);
        if (scalar !== undefined) {
          map[key] = scalar;
        } else {
          map[key] = parseBlock(currentIndent + 2);
        }
      }
    }

    if (isArray) {
      return arr;
    }
    return map;
  };

  const parseMultilineString = (indent: number, fold: boolean): string => {
    const parts: string[] = [];
    while (index < tokens.length) {
      const token = tokens[index];
      if (token.indent < indent) {
        break;
      }
      const text = token.content;
      parts.push(text);
      index += 1;
    }
    const joined = parts.join("\n");
    return fold ? joined.replace(/\n+/g, " ").trim() : joined;
  };

  const parseScalar = (value: string): unknown => {
    if (value === "null" || value === "~") {
      return null;
    }
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    if (value === "[]") {
      return [];
    }
    if (value === "{}") {
      return {};
    }
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return Number(value);
    }
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    return value;
  };

  index = 0;
  return parseBlock(0);
}
