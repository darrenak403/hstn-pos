import { describe, expect, it } from "vitest";
import { MemorySecretStore } from "./memory-secret-store";
import { selectSecretStoreRuntime } from "./secret-store-runtime";

describe("MemorySecretStore", () => {
  it("keeps only the refresh token in memory and clears it on logout", async () => {
    const store = new MemorySecretStore();

    expect(await store.getRefreshToken()).toBeNull();
    await store.setTokens({ accessToken: "access", refreshToken: "refresh" });
    expect(await store.getRefreshToken()).toBe("refresh");
    await store.clear();
    expect(await store.getRefreshToken()).toBeNull();
  });

  it("does not persist credentials across store instances", async () => {
    const firstSession = new MemorySecretStore();
    await firstSession.setTokens({ accessToken: "access", refreshToken: "refresh" });

    expect(await new MemorySecretStore().getRefreshToken()).toBeNull();
  });

  it("keeps a stable device id for the lifetime of this page instance", async () => {
    const store = new MemorySecretStore();

    const [first, second] = await Promise.all([store.getOrCreateDeviceId(), store.getOrCreateDeviceId()]);

    expect(first).toMatch(/^[0-9a-f-]{36}$/i);
    expect(second).toBe(first);
  });
});

describe("selectSecretStoreRuntime", () => {
  it("uses volatile storage for a localhost browser development session", () => {
    expect(selectSecretStoreRuntime({ isTauri: false, isProduction: false, hostname: "localhost" }).kind).toBe("web-dev");
  });

  it("keeps the OS keyring for the native app, including development", () => {
    expect(selectSecretStoreRuntime({ isTauri: true, isProduction: false, hostname: "localhost" }).kind).toBe("tauri");
  });

  it("rejects browser credential storage outside localhost development", () => {
    expect(selectSecretStoreRuntime({ isTauri: false, isProduction: true, hostname: "localhost" }).kind).toBe("unsupported");
    expect(selectSecretStoreRuntime({ isTauri: false, isProduction: false, hostname: "pos.example.com" }).kind).toBe("unsupported");
  });
});
