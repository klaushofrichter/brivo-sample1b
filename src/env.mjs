import fs from "node:fs";
import path from "node:path";

export function loadEnv(filePath = path.resolve(process.cwd(), ".env")) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = parseEnvValue(rawValue);
  }
}

function parseEnvValue(rawValue) {
  let value = rawValue.trim();
  const quote = value[0];
  if ((quote === "\"" || quote === "'") && value[value.length - 1] === quote) {
    value = value.slice(1, -1);
  }

  if (quote === "\"") {
    value = value
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\");
  }

  return value;
}

export function envAny(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== "") {
      return value;
    }
  }

  return undefined;
}
