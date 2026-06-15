import { execFileSync } from "node:child_process";
import { ProxyAgent, setGlobalDispatcher } from "undici";

let configuredProxy: string | undefined;

// Node's fetch does not always inherit the Windows system proxy automatically.
// Configure undici explicitly so local LLM calls use the same network path as
// browser/PowerShell requests.
export function configureHttpProxy(): void {
  const proxyUrl = readProxyUrl();
  if (!proxyUrl || configuredProxy === proxyUrl) {
    return;
  }

  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  configuredProxy = proxyUrl;
}

function readProxyUrl(): string | undefined {
  const envProxy =
    process.env.HTTPS_PROXY ??
    process.env.HTTP_PROXY ??
    process.env.ALL_PROXY ??
    process.env.https_proxy ??
    process.env.http_proxy ??
    process.env.all_proxy;

  if (envProxy) {
    return normalizeProxyUrl(envProxy);
  }

  return process.platform === "win32" ? readWindowsProxyUrl() : undefined;
}

function readWindowsProxyUrl(): string | undefined {
  let output: string;
  try {
    output = execFileSync(
      "reg",
      [
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        "ProxyEnable"
      ],
      { encoding: "utf8", windowsHide: true }
    );
  } catch {
    return undefined;
  }

  if (!/\bProxyEnable\b[\s\S]*0x1\b/i.test(output)) {
    return undefined;
  }

  try {
    output = execFileSync(
      "reg",
      [
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        "ProxyServer"
      ],
      { encoding: "utf8", windowsHide: true }
    );
  } catch {
    return undefined;
  }

  const match = output.match(/ProxyServer\s+REG_SZ\s+(.+)/i);
  if (!match) {
    return undefined;
  }

  return normalizeProxyUrl(parseProxyServerValue(match[1].trim()));
}

function parseProxyServerValue(value: string): string {
  // WinINET can store either "host:port" or "http=host:port;https=host:port".
  const httpsEntry = value
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.toLowerCase().startsWith("https="));

  if (httpsEntry) {
    return httpsEntry.slice("https=".length);
  }

  const firstEntry = value.split(";")[0]?.trim();
  return firstEntry?.includes("=") ? firstEntry.split("=")[1] : firstEntry ?? value;
}

function normalizeProxyUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `http://${value}`;
}
