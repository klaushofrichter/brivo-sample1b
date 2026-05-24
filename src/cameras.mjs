import { envAny } from "./env.mjs";
import { requestJson } from "./http.mjs";

const GLOBAL_API_BASE_URL = "https://api.eagleeyenetworks.com";
const DEFAULT_INCLUDE = "status,locationSummary,deviceInfo,tags";

export async function runCamerasCommand(options) {
  const accessToken = options.token || envAny("EEN_ACCESS_TOKEN", "ACCESS_TOKEN");
  requireValue(accessToken, "Missing EEN_ACCESS_TOKEN.");

  const baseUrl = await resolveBaseUrl(accessToken, options.baseUrl || envAny("EEN_BASE_URL", "EEN_API_BASE_URL"));
  const cameras = await listAllCameras({
    accessToken,
    baseUrl,
    include: options.include,
    pageSize: options.pageSize,
    status: options.status,
    query: options.query,
    tags: options.tags,
    locationIds: options.locationIds,
    bridgeIds: options.bridgeIds
  });

  if (options.json) {
    console.log(JSON.stringify(cameras, null, 2));
    return;
  }

  printCameraTable(cameras);
}

async function resolveBaseUrl(accessToken, configuredBaseUrl) {
  if (configuredBaseUrl) {
    return stripTrailingSlash(configuredBaseUrl);
  }

  const settings = await requestJson(`${GLOBAL_API_BASE_URL}/api/v3.0/clientSettings`, {
    headers: authHeaders(accessToken)
  });

  const httpsBaseUrl = settings?.httpsBaseUrl;
  if (!httpsBaseUrl?.hostname) {
    throw new Error("clientSettings response did not include httpsBaseUrl.hostname.");
  }

  return stripTrailingSlash(
    `https://${httpsBaseUrl.hostname}${httpsBaseUrl.port && httpsBaseUrl.port !== 443 ? `:${httpsBaseUrl.port}` : ""}`
  );
}

async function listAllCameras({
  accessToken,
  baseUrl,
  include = DEFAULT_INCLUDE,
  pageSize = 100,
  status,
  query,
  tags,
  locationIds,
  bridgeIds
}) {
  const cameras = [];
  let pageToken;

  do {
    const url = new URL(`${baseUrl}/api/v3.0/cameras`);
    url.searchParams.set("pageSize", String(pageSize));
    url.searchParams.set("sort", "+name");
    if (include) {
      url.searchParams.set("include", include);
    }
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    if (status) {
      url.searchParams.set("status__in", status);
    }
    if (query) {
      url.searchParams.set("q", query);
    }
    if (tags) {
      url.searchParams.set("tags__contains", tags);
    }
    if (locationIds) {
      url.searchParams.set("locationId__in", locationIds);
    }
    if (bridgeIds) {
      url.searchParams.set("bridgeId__in", bridgeIds);
    }

    const page = await requestJson(url, {
      headers: authHeaders(accessToken)
    });

    cameras.push(...(page?.results || []));
    pageToken = page?.nextPageToken || undefined;
  } while (pageToken);

  return cameras;
}

function printCameraTable(cameras) {
  if (cameras.length === 0) {
    console.log("No cameras found.");
    return;
  }

  const rows = cameras.map((camera) => ({
    id: camera.id || "",
    name: camera.name || "",
    status: statusText(camera.status),
    recording: booleanText(camera.status?.recording),
    location: camera.locationSummary?.name || camera.locationId || "",
    bridgeId: camera.bridgeId || "",
    make: camera.deviceInfo?.make || "",
    model: camera.deviceInfo?.model || ""
  }));

  printTable(rows, ["id", "name", "status", "recording", "location", "bridgeId", "make", "model"]);
}

function printTable(rows, columns) {
  const widths = Object.fromEntries(
    columns.map((column) => [
      column,
      Math.max(column.length, ...rows.map((row) => String(row[column]).length))
    ])
  );

  console.log(columns.map((column) => pad(column, widths[column])).join("  "));
  console.log(columns.map((column) => "-".repeat(widths[column])).join("  "));

  for (const row of rows) {
    console.log(columns.map((column) => pad(row[column], widths[column])).join("  "));
  }
}

function pad(value, width) {
  return String(value).padEnd(width, " ");
}

function booleanText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return value ? "yes" : "no";
}

function statusText(status) {
  if (!status) {
    return "";
  }

  if (typeof status === "string") {
    return status;
  }

  return status.state || status.connectionStatus || status.recordingStatus || "";
}

function authHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`
  };
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function requireValue(value, message) {
  if (!value) {
    throw new Error(message);
  }
}
