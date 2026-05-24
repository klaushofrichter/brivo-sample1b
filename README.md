# Brivo Eagle Eye Camera CLI

Small Node.js command line tool for listing cameras from the Brivo Eagle Eye Video API.

This example was created with help from Codex using GPT-5.

The tool has two jobs:

- `auth`: runs the OAuth authorization-code flow with Playwright and prints shell exports for the resulting access token.
- `cameras`: calls `GET /api/v3.0/cameras`, follows pagination, and prints a camera table or raw JSON.

## Requirements

- Node.js 20 or newer
- An Eagle Eye/Brivo Video API OAuth client
- A redirect URI registered for that OAuth client
- A user account that can log in and view cameras

Developers can create their own OAuth `CLIENT_ID` and `CLIENT_SECRET` in the Eagle Eye developer portal on the [My Application](https://developer.eagleeyenetworks.com/page/my-application) page. Add the same redirect URI there that you plan to use locally, such as `http://127.0.0.1:3333`.

## Setup

Install dependencies and the Playwright Chromium browser:

```bash
npm install
npm run install:browsers
```

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

The real `.env` file is ignored by git and must not be committed.

## Environment

Required for OAuth login:

```bash
TEST_USER="user@example.com"
TEST_PASSWORD="your-user-password"
CLIENT_ID="your-oauth-client-id"
CLIENT_SECRET="your-oauth-client-secret"
REDIRECT_URI="http://127.0.0.1:3333"
```

`REDIRECT_URI` must exactly match a redirect URI registered for the OAuth client. The CLI starts a local callback server on that host and port during `auth`.

Optional alternatives:

- `EEN_CLIENT_ID`, `EEN_CLIENT_SECRET`, and `EEN_REDIRECT_URI` are also accepted.
- `VITE_EEN_CLIENT_ID` and `VITE_REDIRECT_URI` are accepted for compatibility with existing frontend env files.
- `EEN_PROXY_URL`, `PROXY_URL`, or `VITE_PROXY_URL` can be used to exchange the authorization code through a proxy when no client secret is configured locally.

## Authenticate

```bash
npm run auth
```

For visible browser automation:

```bash
npm run auth -- --headed
```

If login requires manual confirmation, keep the browser visible longer:

```bash
npm run auth -- --headed --timeout-ms 300000
```

The auth command prints shell exports:

```bash
export EEN_ACCESS_TOKEN='...'
export EEN_BASE_URL='https://api.c021.eagleeyenetworks.com'
export EEN_REFRESH_TOKEN='...'
```

Apply those exports in the current shell:

```bash
eval "$(npm run --silent auth)"
```

## List Cameras

After authentication:

```bash
npm run cameras
```

One-shot auth plus listing:

```bash
eval "$(npm run --silent auth)" && npm run --silent cameras
```

Useful options:

```bash
npm run cameras -- --json
npm run cameras -- --status online
npm run cameras -- --query entrance
npm run cameras -- --tags lobby,public
npm run cameras -- --page-size 50
```

The camera command uses `EEN_ACCESS_TOKEN` and, when present, `EEN_BASE_URL`. If no base URL is provided, it resolves the account-specific base URL from `GET /api/v3.0/clientSettings`.

## Commands

```bash
npm run auth -- --help
npm run cameras -- --help
```
