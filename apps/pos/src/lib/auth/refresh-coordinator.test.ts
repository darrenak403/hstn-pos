import { describe, expect, it, vi } from "vitest";
import {
  RefreshCoordinator,
  SessionExpiredError,
  NetworkError,
  SecretStoreError,
  type SecretStore,
  type RefreshTransport,
  type TokenPair,
} from "./refresh-coordinator";

function makeJwt(expiresInSeconds: number): string {
  const encodeBase64Url = (value: string) => btoa(value).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const header = encodeBase64Url(JSON.stringify({ alg: "none" }));
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = encodeBase64Url(JSON.stringify({ sub: "u1", exp }));
  return `${header}.${payload}.sig`;
}

function buildStore(initialRefreshToken: string | null): SecretStore {
  let refreshToken = initialRefreshToken;
  return {
    getRefreshToken: vi.fn(async () => refreshToken),
    setTokens: vi.fn(async (pair: TokenPair) => {
      refreshToken = pair.refreshToken;
    }),
    clear: vi.fn(async () => {
      refreshToken = null;
    }),
  };
}

describe("RefreshCoordinator", () => {
  it("trả thẳng access token hiện tại nếu còn hạn, không gọi transport", async () => {
    const store = buildStore("rt-1");
    const transport: RefreshTransport = { refresh: vi.fn() };
    const coordinator = new RefreshCoordinator("device-1", store, transport, vi.fn());

    await coordinator.setTokens({ accessToken: makeJwt(3600), refreshToken: "rt-1" });

    const token = await coordinator.getValidAccessToken();

    expect(token).toContain(".");
    expect(transport.refresh).not.toHaveBeenCalled();
  });

  it("tự refresh chủ động khi access token sắp hết hạn (< 60s)", async () => {
    const store = buildStore("rt-1");
    const newPair: TokenPair = { accessToken: makeJwt(3600), refreshToken: "rt-2" };
    const transport: RefreshTransport = { refresh: vi.fn(async () => newPair) };
    const coordinator = new RefreshCoordinator("device-1", store, transport, vi.fn());

    await coordinator.setTokens({ accessToken: makeJwt(30), refreshToken: "rt-1" });

    const token = await coordinator.getValidAccessToken();

    expect(token).toBe(newPair.accessToken);
    expect(transport.refresh).toHaveBeenCalledTimes(1);
    expect(transport.refresh).toHaveBeenCalledWith("rt-1", "device-1");
  });

  it("single-flight: nhiều lời gọi refresh đồng thời chỉ tạo đúng một request tới transport", async () => {
    const store = buildStore("rt-1");
    const newPair: TokenPair = { accessToken: makeJwt(3600), refreshToken: "rt-2" };
    let resolveRefresh: (pair: TokenPair) => void = () => {};
    const refreshPromise = new Promise<TokenPair>((resolve) => {
      resolveRefresh = resolve;
    });
    const transport: RefreshTransport = { refresh: vi.fn(() => refreshPromise) };
    const coordinator = new RefreshCoordinator("device-1", store, transport, vi.fn());

    await coordinator.setTokens({ accessToken: makeJwt(1), refreshToken: "rt-1" });

    const call1 = coordinator.getValidAccessToken();
    const call2 = coordinator.getValidAccessToken();
    const call3 = coordinator.refreshAfter401();

    resolveRefresh(newPair);

    const [token1, token2, token3] = await Promise.all([call1, call2, call3]);

    expect(transport.refresh).toHaveBeenCalledTimes(1);
    expect(token1).toBe(newPair.accessToken);
    expect(token2).toBe(newPair.accessToken);
    expect(token3).toBe(newPair.accessToken);
  });

  it("cho phép một lượt refresh mới sau khi lượt trước đã hoàn tất", async () => {
    const store = buildStore("rt-1");
    const pair2: TokenPair = { accessToken: makeJwt(3600), refreshToken: "rt-2" };
    const pair3: TokenPair = { accessToken: makeJwt(3600), refreshToken: "rt-3" };
    const transport: RefreshTransport = {
      refresh: vi.fn().mockResolvedValueOnce(pair2).mockResolvedValueOnce(pair3),
    };
    const coordinator = new RefreshCoordinator("device-1", store, transport, vi.fn());

    await coordinator.setTokens({ accessToken: makeJwt(1), refreshToken: "rt-1" });
    await coordinator.getValidAccessToken();

    await coordinator.setTokens({ accessToken: makeJwt(1), refreshToken: "rt-2" });
    const token = await coordinator.getValidAccessToken();

    expect(transport.refresh).toHaveBeenCalledTimes(2);
    expect(token).toBe(pair3.accessToken);
  });

  it("refresh token bị server từ chối (401) -> xoá secret store và báo hết phiên", async () => {
    const store = buildStore("rt-1");
    const onSessionExpired = vi.fn();
    const transport: RefreshTransport = {
      refresh: vi.fn(async () => {
        throw { status: 401 };
      }),
    };
    const coordinator = new RefreshCoordinator("device-1", store, transport, onSessionExpired);
    await coordinator.setTokens({ accessToken: makeJwt(1), refreshToken: "rt-1" });

    await expect(coordinator.getValidAccessToken()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("không có refresh token trong store -> báo hết phiên ngay, không gọi transport", async () => {
    const store = buildStore(null);
    const onSessionExpired = vi.fn();
    const transport: RefreshTransport = { refresh: vi.fn() };
    const coordinator = new RefreshCoordinator("device-1", store, transport, onSessionExpired);

    await expect(coordinator.refreshAfter401()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(transport.refresh).not.toHaveBeenCalled();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("lỗi mạng (không phải 401) -> ném NetworkError, KHÔNG xoá store, KHÔNG báo hết phiên", async () => {
    const store = buildStore("rt-1");
    const onSessionExpired = vi.fn();
    const networkFailure = new Error("ECONNRESET");
    const transport: RefreshTransport = {
      refresh: vi.fn(async () => {
        throw networkFailure;
      }),
    };
    const coordinator = new RefreshCoordinator("device-1", store, transport, onSessionExpired);
    coordinator.setTokens({ accessToken: makeJwt(1), refreshToken: "rt-1" });

    const error = await coordinator.getValidAccessToken().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).cause).toBe(networkFailure);
    expect(store.clear).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("không sử dụng access token nếu refresh token chưa được ghi vào vault", async () => {
    const store = buildStore("rt-1");
    vi.mocked(store.setTokens).mockRejectedValueOnce(new Error("vault unavailable"));
    const transport: RefreshTransport = { refresh: vi.fn() };
    const coordinator = new RefreshCoordinator("device-1", store, transport, vi.fn());

    await expect(coordinator.setTokens({ accessToken: makeJwt(3600), refreshToken: "rt-2" })).rejects.toThrow(
      "Không truy cập được kho bảo mật",
    );
    await expect(coordinator.getValidAccessToken()).rejects.toBeInstanceOf(SecretStoreError);
  });
});
