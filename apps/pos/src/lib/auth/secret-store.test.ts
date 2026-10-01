import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { TauriSecretStore } from "./secret-store";

describe("TauriSecretStore", () => {
  beforeEach(() => invokeMock.mockReset());

  it("propagates OS vault errors instead of treating them as missing credentials", async () => {
    const vaultError = new Error("credential service unavailable");
    invokeMock.mockRejectedValue(vaultError);
    const store = new TauriSecretStore();

    await expect(store.getRefreshToken()).rejects.toBe(vaultError);
  });

  it("creates one device id and stores it in the OS vault", async () => {
    invokeMock.mockResolvedValueOnce(null).mockResolvedValueOnce(undefined);
    const store = new TauriSecretStore();

    const deviceId = await store.getOrCreateDeviceId();

    expect(deviceId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_secret", { account: "device-id" });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "set_secret", { account: "device-id", value: deviceId });
  });
});
