import { invoke } from "@tauri-apps/api/core";
import type { SecretStore, TokenPair } from "./refresh-coordinator";

const REFRESH_TOKEN_ACCOUNT = "refresh-token";
const DEVICE_ID_ACCOUNT = "device-id";

/**
 * Lưu refresh token vào OS credential vault thật (Keychain/Credential
 * Manager/Secret Service) qua lệnh Tauri do Rust `keyring` crate xử lý — xem
 * src-tauri/src/secrets.rs. KHÔNG dùng tauri-plugin-store: plugin đó ghi JSON
 * plaintext ra đĩa, không phải kho bí mật của hệ điều hành (xem ADR
 * 0001-token-storage.md).
 */
export class TauriSecretStore implements SecretStore {
  private static deviceIdLoad: Promise<string> | null = null;

  async getRefreshToken(): Promise<string | null> {
    return this.read(REFRESH_TOKEN_ACCOUNT);
  }

  async setTokens(pair: TokenPair): Promise<void> {
    await invoke("set_secret", { account: REFRESH_TOKEN_ACCOUNT, value: pair.refreshToken });
  }

  async clear(): Promise<void> {
    await invoke("delete_secret", { account: REFRESH_TOKEN_ACCOUNT });
  }

  /** Mỗi máy cài đặt có đúng 1 deviceId cố định, sinh một lần và lưu lại trong keyring. */
  async getOrCreateDeviceId(): Promise<string> {
    if (TauriSecretStore.deviceIdLoad != null) return TauriSecretStore.deviceIdLoad;
    const load = this.loadOrCreateDeviceId();
    TauriSecretStore.deviceIdLoad = load;
    try {
      return await load;
    } finally {
      if (TauriSecretStore.deviceIdLoad === load) TauriSecretStore.deviceIdLoad = null;
    }
  }

  private async loadOrCreateDeviceId(): Promise<string> {
    const existing = await this.read(DEVICE_ID_ACCOUNT);
    if (existing != null) return existing;

    const generated = crypto.randomUUID();
    await invoke("set_secret", { account: DEVICE_ID_ACCOUNT, value: generated });
    return generated;
  }

  private async read(account: string): Promise<string | null> {
    return invoke<string | null>("get_secret", { account });
  }
}
