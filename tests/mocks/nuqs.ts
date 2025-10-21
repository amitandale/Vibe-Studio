import { useState } from "react";

type Options<T> = {
  defaultValue?: T;
};

export function useQueryState<T extends string | null = string | null>(
  _key: string,
  options?: Options<T>,
) {
  const [value, setValue] = useState<T | null>(
    (options?.defaultValue ?? null) as T | null,
  );
  return [value, setValue] as const;
}

export const parseAsBoolean = {
  parse: (value: string | null) => value === "true",
  serialize: (value: boolean) => (value ? "true" : "false"),
  withDefault(defaultValue: boolean) {
    return {
      defaultValue: defaultValue ? "true" : "false",
      parse: (value: string | null) => value === "true",
      serialize: (value: boolean) => (value ? "true" : "false"),
    };
  },
};
