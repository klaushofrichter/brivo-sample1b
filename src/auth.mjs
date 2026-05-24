import http from "node:http";
import { once } from "node:events";
import { chromium } from "playwright";
import { envAny } from "./env.mjs";
import { requestJson } from "./http.mjs";

const AUTHORIZATION_URL = "https://auth.eagleeyenetworks.com/oauth2/authorize";
const TOKEN_URL = "https://auth.eagleeyenetworks.com/oauth2/token";

export async function runAuthCommand(options) {
  const clientId = envAny("EEN_CLIENT_ID", "CLIENT_ID", "VITE_EEN_CLIENT_ID");
  const clientSecret = envAny("EEN_CLIENT_SECRET", "CLIENT_SECRET");
  const proxyUrl = options.proxyUrl || envAny("EEN_PROXY_URL", "PROXY_URL", "VITE_PROXY_URL");
  const username = envAny("TEST_USER", "EEN_USERNAME", "USERNAME");
  const password = envAny("TEST_PASSWORD", "EEN_PASSWORD", "PASSWORD");
  const redirectUri = options.redirectUri || envAny("EEN_REDIRECT_URI", "REDIRECT_URI", "VITE_REDIRECT_URI") || "http://127.0.0.1:3333";
  const scope = options.scope || envAny("EEN_SCOPE") || "vms.all";

  requireValue(clientId, "Missing EEN_CLIENT_ID or VITE_EEN_CLIENT_ID.");
  requireValue(username, "Missing TEST_USER.");
  requireValue(password, "Missing TEST_PASSWORD.");

  const callbackServer = await createCallbackServer(redirectUri);
  const browser = await chromium.launch({ headless: options.headless });

  try {
    const authUrl = buildAuthorizeUrl({ clientId, redirectUri, scope });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(authUrl, { waitUntil: "domcontentloaded" });
    await completeLogin(page, username, password);

    const callback = await withTimeout(
      callbackServer.waitForCallback,
      options.timeoutMs,
      "Timed out waiting for the OAuth redirect callback."
    );
    if (callback.error) {
      throw new Error(`OAuth authorization failed: ${callback.error}${callback.errorDescription ? ` - ${callback.errorDescription}` : ""}`);
    }

    if (callback.accessToken) {
      printTokenExports({
        access_token: callback.accessToken,
        token_type: callback.tokenType || "Bearer"
      });
      return;
    }

    requireValue(callback.code, "OAuth redirect did not include a code or access_token.");

    const tokenResponse = await exchangeCode({
      code: callback.code,
      redirectUri,
      scope,
      clientId,
      clientSecret,
      proxyUrl
    });

    printTokenExports(normalizeTokenResponse(tokenResponse));
  } finally {
    await browser.close();
    await callbackServer.close();
  }
}

function buildAuthorizeUrl({ clientId, redirectUri, scope }) {
  const url = new URL(AUTHORIZATION_URL);
  url.searchParams.set("scope", scope);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

async function exchangeCode({ code, redirectUri, scope, clientId, clientSecret, proxyUrl }) {
  if (proxyUrl && !clientSecret) {
    const url = new URL(`${stripTrailingSlash(proxyUrl)}/proxy/getAccessToken`);
    url.searchParams.set("code", code);
    url.searchParams.set("redirect_uri", redirectUri);

    return requestJson(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Origin: new URL(redirectUri).origin
      }
    });
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    scope,
    code,
    redirect_uri: redirectUri
  });

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded"
  };

  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  } else {
    params.set("client_id", clientId);
  }

  return requestJson(TOKEN_URL, {
    method: "POST",
    headers,
    body: params
  });
}

async function createCallbackServer(redirectUri) {
  const redirect = new URL(redirectUri);
  if (redirect.protocol !== "http:") {
    throw new Error(`Redirect URI must use http for the local callback server: ${redirectUri}`);
  }

  const hostname = redirect.hostname;
  const port = Number(redirect.port || 80);
  const expectedPath = normalizePath(redirect.pathname);
  let resolveCallback;
  let rejectCallback;

  const waitForCallback = new Promise((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server = http.createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url, redirectUri);
      if (normalizePath(requestUrl.pathname) !== expectedPath) {
        response.writeHead(404, { "Content-Type": "text/plain" });
        response.end("Not found");
        return;
      }

      const fragmentScript = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>OAuth complete</title></head>
  <body>
    <p>OAuth complete. You can close this window.</p>
    <script>
      if (location.hash && !location.search) {
        location.replace(location.pathname + "?" + location.hash.slice(1));
      }
    </script>
  </body>
</html>`;

      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(fragmentScript);

      const callback = {
        code: requestUrl.searchParams.get("code"),
        accessToken: requestUrl.searchParams.get("access_token"),
        tokenType: requestUrl.searchParams.get("token_type"),
        error: requestUrl.searchParams.get("error"),
        errorDescription: requestUrl.searchParams.get("error_description")
      };

      if (callback.code || callback.accessToken || callback.error) {
        resolveCallback(callback);
      }
    } catch (error) {
      rejectCallback(error);
    }
  });

  server.listen(port, hostname);
  await once(server, "listening");

  return {
    waitForCallback,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

function normalizePath(pathname) {
  return pathname === "" ? "/" : pathname;
}

async function completeLogin(page, username, password) {
  await fillFirst(page, [
    page.getByLabel(/email|username|user name/i),
    page.getByPlaceholder(/email|username|user name/i),
    page.locator("input[type='email']"),
    page.locator("input[name='username']"),
    page.locator("input[name='email']"),
    page.locator("input[type='text']")
  ], username);

  const passwordFilled = await fillPassword(page, password, { required: false });
  if (!passwordFilled) {
    await clickFirst(page, [
      page.getByRole("button", { name: /continue|next/i }),
      page.locator("button[type='submit']"),
      page.locator("input[type='submit']")
    ]);
    await fillPassword(page, password);
  }

  await clickFirst(page, [
    page.getByRole("button", { name: /sign in|log in|login|continue|next/i }),
    page.locator("button[type='submit']"),
    page.locator("input[type='submit']")
  ]);

  await clickConsentIfShown(page);
}

async function fillPassword(page, password, { required = true } = {}) {
  return fillFirst(page, [
    page.getByLabel(/password/i),
    page.getByPlaceholder(/password/i),
    page.locator("input[type='password']"),
    page.locator("input[name='password']")
  ], password, { required });
}

async function clickConsentIfShown(page) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (page.url().startsWith("http://127.0.0.1") || page.url().startsWith("http://localhost")) {
      return;
    }

    const clicked = await clickFirst(page, [
      page.getByRole("button", { name: /allow|approve|authorize|accept|agree|continue/i }),
      page.locator("button[type='submit']")
    ], { required: false, timeout: 1000 });

    if (clicked) {
      return;
    }

    await page.waitForTimeout(500);
  }
}

async function fillFirst(page, locators, value, { required = true } = {}) {
  for (const locator of locators) {
    const first = locator.first();
    try {
      await first.waitFor({ state: "visible", timeout: 3000 });
      await first.fill(value);
      return true;
    } catch {
      continue;
    }
  }

  if (!required) {
    return false;
  }

  throw new Error(`Could not find a visible field on ${page.url()}.`);
}

async function clickFirst(page, locators, { required = true, timeout = 5000 } = {}) {
  for (const locator of locators) {
    const first = locator.first();
    try {
      await first.waitFor({ state: "visible", timeout });
      await Promise.allSettled([
        page.waitForLoadState("domcontentloaded", { timeout: 10000 }),
        first.click()
      ]);
      return true;
    } catch {
      continue;
    }
  }

  if (required) {
    throw new Error(`Could not find a clickable submit button on ${page.url()}.`);
  }

  return false;
}

function printTokenExports(tokenResponse) {
  requireValue(tokenResponse.access_token, "Token response did not include an access token.");

  const httpsBaseUrl = tokenResponse.httpsBaseUrl;
  const baseUrl = httpsBaseUrl?.hostname
    ? `https://${httpsBaseUrl.hostname}${httpsBaseUrl.port && httpsBaseUrl.port !== 443 ? `:${httpsBaseUrl.port}` : ""}`
    : undefined;

  console.log(`export EEN_ACCESS_TOKEN=${shellQuote(tokenResponse.access_token)}`);
  if (baseUrl) {
    console.log(`export EEN_BASE_URL=${shellQuote(baseUrl)}`);
  }
  if (tokenResponse.refresh_token) {
    console.log(`export EEN_REFRESH_TOKEN=${shellQuote(tokenResponse.refresh_token)}`);
  }
  if (tokenResponse.expires_in) {
    console.log(`# expires_in=${tokenResponse.expires_in}`);
  }
}

function normalizeTokenResponse(tokenResponse) {
  const accessToken = tokenResponse.access_token || tokenResponse.accessToken;
  const expiresIn = tokenResponse.expires_in || tokenResponse.expiresIn;
  const httpsBaseUrl = normalizeBaseUrl(tokenResponse.httpsBaseUrl);

  return {
    ...tokenResponse,
    access_token: accessToken,
    expires_in: expiresIn,
    httpsBaseUrl
  };
}

function normalizeBaseUrl(value) {
  if (!value || typeof value !== "string") {
    return value;
  }

  const url = new URL(value);
  return {
    hostname: url.hostname,
    port: Number(url.port || 443)
  };
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function requireValue(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

function withTimeout(promise, timeoutMs, message) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}
