import { MemorySecretStore } from "./memory-secret-store";
import { TauriSecretStore } from "./secret-store";

type DeviceSecretStore = {
  getRefreshToken(): Promise<string | null>;
  setTokens(pair: { accessToken: string; refreshToken: string }): Promise<void>;
  clear(): Promise<void>;
  getOrCreateDeviceId(): Promise<string>;
};

export type SecretStoreRuntime =
  | { kind: "tauri"; store: DeviceSecretStore }
  | { kind: "web-dev"; store: DeviceSecretStore }
  | { kind: "unsupported"; store: null };

interface RuntimeOptions {
  isTauri: boolean;
  isProduction: boolean;
  hostname: string;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function selectSecretStoreRuntime(options: RuntimeOptions): SecretStoreRuntime {
  if (options.isTauri) return { kind: "tauri", store: new TauriSecretStore() };
  if (!options.isProduction && LOCAL_HOSTS.has(options.hostname)) {
    return { kind: "web-dev", store: new MemorySecretStore() };
  }
  return { kind: "unsupported", store: null };
}
