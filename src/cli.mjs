#!/usr/bin/env node

import { runAuthCommand } from "./auth.mjs";
import { runCamerasCommand } from "./cameras.mjs";
import { loadEnv } from "./env.mjs";
import { formatHttpError } from "./http.mjs";

loadEnv();

const [command, ...argv] = process.argv.slice(2);

try {
  switch (command) {
    case "auth":
      await runAuthCommand(parseAuthOptions(argv));
      break;
    case "cameras":
      await runCamerasCommand(parseCameraOptions(argv));
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(formatHttpError(error));
  process.exitCode = 1;
}

function parseAuthOptions(argv) {
  const options = {
    headless: true,
    timeoutMs: 120000
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--headed":
        options.headless = false;
        break;
      case "--headless":
        options.headless = true;
        break;
      case "--redirect-uri":
        options.redirectUri = readValue(argv, ++index, arg);
        break;
      case "--scope":
        options.scope = readValue(argv, ++index, arg);
        break;
      case "--proxy-url":
        options.proxyUrl = readValue(argv, ++index, arg);
        break;
      case "--timeout-ms":
        options.timeoutMs = Number(readValue(argv, ++index, arg));
        if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000) {
          throw new Error("--timeout-ms must be an integer of at least 1000.");
        }
        break;
      case "--help":
      case "-h":
        printAuthHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown auth option: ${arg}`);
    }
  }

  return options;
}

function parseCameraOptions(argv) {
  const options = {
    pageSize: 100
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--json":
        options.json = true;
        break;
      case "--token":
        options.token = readValue(argv, ++index, arg);
        break;
      case "--base-url":
        options.baseUrl = readValue(argv, ++index, arg);
        break;
      case "--include":
        options.include = readValue(argv, ++index, arg);
        break;
      case "--page-size":
        options.pageSize = Number(readValue(argv, ++index, arg));
        if (!Number.isInteger(options.pageSize) || options.pageSize < 1) {
          throw new Error("--page-size must be a positive integer.");
        }
        break;
      case "--status":
        options.status = readValue(argv, ++index, arg);
        break;
      case "--query":
      case "-q":
        options.query = readValue(argv, ++index, arg);
        break;
      case "--tags":
        options.tags = readValue(argv, ++index, arg);
        break;
      case "--location-ids":
        options.locationIds = readValue(argv, ++index, arg);
        break;
      case "--bridge-ids":
        options.bridgeIds = readValue(argv, ++index, arg);
        break;
      case "--help":
      case "-h":
        printCamerasHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown cameras option: ${arg}`);
    }
  }

  return options;
}

function readValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }

  return value;
}

function printHelp() {
  console.log(`Usage:
  npm run auth -- [options]
  npm run cameras -- [options]

Commands:
  auth      Run Playwright OAuth and print shell exports for tokens
  cameras   List cameras using EEN_ACCESS_TOKEN

Run a command with --help for command-specific options.`);
}

function printAuthHelp() {
  console.log(`Usage:
  npm run auth -- [options]

Environment:
  TEST_USER             OAuth login username
  TEST_PASSWORD         OAuth login password
  EEN_CLIENT_ID         OAuth client id, or CLIENT_ID or VITE_EEN_CLIENT_ID
  EEN_CLIENT_SECRET     Optional client secret for confidential clients
  EEN_PROXY_URL         Optional token exchange proxy, or VITE_PROXY_URL
  EEN_REDIRECT_URI      Optional redirect URI, or REDIRECT_URI or VITE_REDIRECT_URI

Options:
  --headed              Show the browser while logging in
  --headless            Run browser headlessly (default)
  --redirect-uri URI    Override redirect URI
  --proxy-url URL       Override token exchange proxy
  --scope SCOPE         Override OAuth scope (default: vms.all)
  --timeout-ms NUMBER   Max time waiting for redirect (default: 120000)`);
}

function printCamerasHelp() {
  console.log(`Usage:
  npm run cameras -- [options]

Environment:
  EEN_ACCESS_TOKEN      Bearer token from npm run auth
  EEN_BASE_URL          Optional account API base URL from auth output

Options:
  --json                Print raw JSON camera array
  --token TOKEN         Override EEN_ACCESS_TOKEN
  --base-url URL        Override EEN_BASE_URL
  --include FIELDS      Comma-separated include fields
  --page-size NUMBER    Page size for API pagination (default: 100)
  --status STATUS       Filter status, for example online,offline
  --query TEXT          Search cameras
  --tags TAGS           Comma-separated tags cameras must contain
  --location-ids IDS    Comma-separated location ids
  --bridge-ids IDS      Comma-separated bridge ids`);
}
