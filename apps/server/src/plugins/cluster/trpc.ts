import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import dns from "node:dns/promises";
import net from "node:net";

import type { AppRouter } from "@repo/cluster";

import config from "../../config";

/** Shared secret for authenticating server→cluster requests. */
const clusterSecret = process.env.CLUSTER_SECRET || undefined;

function resolveClusterUrl(): string {
  const envHost = process.env.CLUSTER_HOST;
  const discoveryService = process.env.CLUSTER_DISCOVERY_SERVICE;
  const discoveryNamespace = process.env.CLUSTER_DISCOVERY_NAMESPACE;
  const envPort = process.env.CLUSTER_PORT;

  let host: string;
  if (envHost && envHost !== "0.0.0.0") {
    host = envHost;
  } else if (discoveryService && discoveryNamespace) {
    host = `${discoveryService}.${discoveryNamespace}`;
  } else {
    host = config.cluster.name;
  }

  const port = envPort ?? String(config.cluster.port);
  return `http://${host}:${port}`;
}

const clusterUrl = resolveClusterUrl();
console.info("[cluster] resolved cluster trpc url", { url: clusterUrl });

const clusterBaseUrl = new URL(clusterUrl);
const CLUSTER_DNS_CACHE_MS = Number(
  process.env.CLUSTER_DNS_CACHE_MS ?? "30000"
);
let cachedClusterIp: string | undefined;
let cachedClusterIpAt = 0;

async function resolveClusterIp(): Promise<string> {
  const host = clusterBaseUrl.hostname;
  if (net.isIP(host)) return host;

  const now = Date.now();
  if (cachedClusterIp && now - cachedClusterIpAt < CLUSTER_DNS_CACHE_MS) {
    return cachedClusterIp;
  }

  const addresses = await dns.resolve4(host);
  const ip = addresses[0];
  if (!ip) throw new Error(`No A records found for cluster host: ${host}`);

  const changed = cachedClusterIp !== ip;
  cachedClusterIp = ip;
  cachedClusterIpAt = now;
  if (changed) {
    console.info("[cluster] resolved cluster host via dns", { host, ip });
  }

  return ip;
}

function isRetryableNetworkError(error: unknown): boolean {
  const codes: Array<unknown> = [];
  let cursor: unknown = error;
  for (let i = 0; i < 6 && cursor; i++) {
    const cur = cursor as Record<string, unknown>;
    if (cur.code) codes.push(cur.code);
    cursor = cur.cause;
  }

  return codes.some(
    (code) =>
      code === "ECONNREFUSED" ||
      code === "EHOSTUNREACH" ||
      code === "ENETUNREACH" ||
      code === "ETIMEDOUT" ||
      code === "UND_ERR_CONNECT_TIMEOUT" ||
      code === "UND_ERR_HEADERS_TIMEOUT" ||
      code === "UND_ERR_SOCKET"
  );
}

const CLUSTER_TRPC_TIMEOUT_MS = Number(
  process.env.CLUSTER_TRPC_TIMEOUT_MS ?? "180000"
);

async function doFetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1]
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLUSTER_TRPC_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const host = clusterBaseUrl.hostname;
  const needsDnsPinning = !net.isIP(host);

  const maybeRewriteUrl = async (urlString: string): Promise<string> => {
    if (!needsDnsPinning) return urlString;

    const url = new URL(urlString);
    if (url.hostname !== host || url.port !== clusterBaseUrl.port) {
      return urlString;
    }

    try {
      const ip = await resolveClusterIp();
      url.hostname = ip;
      return url.toString();
    } catch {
      return urlString;
    }
  };

  const doFetch = async (): Promise<Response> => {
    if (typeof input === "string") {
      return await doFetchWithTimeout(await maybeRewriteUrl(input), init);
    }

    if (input instanceof URL) {
      return await doFetchWithTimeout(
        await maybeRewriteUrl(input.toString()),
        init
      );
    }

    if (input instanceof Request) {
      const rewrittenUrl = await maybeRewriteUrl(input.url);
      const requestForFetch =
        rewrittenUrl === input.url
          ? input
          : new Request(rewrittenUrl, input.clone());
      return await doFetchWithTimeout(requestForFetch, init);
    }

    return await doFetchWithTimeout(input, init);
  };

  try {
    return await doFetch();
  } catch (error) {
    if (needsDnsPinning && isRetryableNetworkError(error)) {
      cachedClusterIp = undefined;
      cachedClusterIpAt = 0;

      return await doFetch();
    }
    throw error;
  }
};

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${clusterUrl}/trpc`,
      fetch: fetchWithTimeout,
      headers: clusterSecret
        ? { Authorization: `Bearer ${clusterSecret}` }
        : undefined,
    }),
  ],
});
