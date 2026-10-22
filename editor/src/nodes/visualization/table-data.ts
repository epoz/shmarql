/** Normalizes tabular result data for visualization renderers. */

import type { SparqlExecutionResult } from "../sparql/api-client";

export type TableColumnType = "string" | "number" | "date" | "boolean";

export type NormalizedTableColumn = {
  name: string;
  type: TableColumnType;
};

export type NormalizedTableRow = Record<string, string | number | boolean | null>;

export type NormalizedTable = {
  columns: NormalizedTableColumn[];
  rows: NormalizedTableRow[];
};

export function normalizeSparqlResult(result: SparqlExecutionResult): NormalizedTable {
  if (result.status === "error" || result.variables.length === 0) {
    return {
      columns: [],
      rows: []
    };
  }

  const rows = result.rows.map((row) =>
    Object.fromEntries(
      result.variables.map((variable) => [
        variable,
        row[variable]?.value ? coerceValue(row[variable]?.value ?? "") : null
      ])
    )
  );

  return inferColumnTypes(result.variables, rows);
}

export function parseDelimitedTable(source: string, delimiter: "," | "\t"): NormalizedTable {
  const records = parseDelimitedRows(source, delimiter).filter((row) =>
    row.some((value) => value.trim().length > 0)
  );
  const [headers = [], ...body] = records;
  const columns = headers.map((header, index) => normalizeHeader(header, index));
  const rows = body.map((record) =>
    Object.fromEntries(columns.map((column, index) => [column, coerceValue(record[index] ?? "")]))
  );

  return inferColumnTypes(columns, rows);
}

function parseDelimitedRows(source: string, delimiter: "," | "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  rows.push(row);

  return rows;
}

function normalizeHeader(header: string, index: number): string {
  const normalized = header.trim();

  return normalized || `column_${index + 1}`;
}

function coerceValue(value: string): string | number | boolean | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }
  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase() === "true";
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  return trimmed;
}

function inferColumnTypes(names: string[], rows: NormalizedTableRow[]): NormalizedTable {
  const columns = names.map((name) => ({
    name,
    type: inferColumnType(rows.map((row) => row[name]))
  }));

  return {
    columns,
    rows
  };
}

function inferColumnType(values: Array<string | number | boolean | null>): TableColumnType {
  const present = values.filter((value) => value !== null);

  if (present.length === 0) {
    return "string";
  }
  if (present.every((value) => typeof value === "number")) {
    return "number";
  }
  if (present.every((value) => typeof value === "boolean")) {
    return "boolean";
  }
  if (present.every((value) => typeof value === "string" && !Number.isNaN(Date.parse(value)))) {
    return "date";
  }

  return "string";
}
