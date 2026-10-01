import type { SecretStore, TokenPair } from "./refresh-coordinator";

/**
 * Volatile credential storage for localhost browser development only.
 * Nothing is written to localStorage, sessionStorage, or disk. A reload logs
 * the user out; production builds must use the native Tauri keyring instead.
 */
export class MemorySecretStore implements SecretStore {
  private refreshToken: string | null = null;
  private deviceId: string | null = null;

  async getRefreshToken(): Promise<string | null> {
    return this.refreshToken;
  }

  async setTokens(pair: TokenPair): Promise<void> {
    this.refreshToken = pair.refreshToken;
  }

  async clear(): Promise<void> {
    this.refreshToken = null;
  }

  async getOrCreateDeviceId(): Promise<string> {
    this.deviceId ??= globalThis.crypto.randomUUID();
    return this.deviceId;
  }
}
