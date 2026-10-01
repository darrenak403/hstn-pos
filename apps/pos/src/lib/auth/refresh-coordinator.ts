const PROACTIVE_REFRESH_WINDOW_MS = 60_000;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface SecretStore {
  getRefreshToken(): Promise<string | null>;
  setTokens(pair: TokenPair): Promise<void>;
  clear(): Promise<void>;
}

export interface RefreshTransport {
  refresh(refreshToken: string, deviceId: string): Promise<TokenPair>;
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại");
    this.name = "SessionExpiredError";
  }
}

export class NetworkError extends Error {
  constructor(override readonly cause: unknown) {
    super("Mất kết nối máy chủ");
    this.name = "NetworkError";
  }
}

export class SecretStoreError extends Error {
  constructor(override readonly cause: unknown) {
    super("Không truy cập được kho bảo mật của thiết bị");
    this.name = "SecretStoreError";
  }
}

export interface AuthRejection {
  status: 401;
}

export function isAuthRejection(error: unknown): error is AuthRejection {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === 401
  );
}

function decodeJwtExpiryMs(accessToken: string): number | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64)) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Điều phối refresh access token phía client.
 *
 * Thiết kế single-flight này tồn tại vì review trước đó đã chỉ ra: nếu nhiều
 * request song song cùng gặp access token hết hạn và mỗi request tự gọi
 * POST /auth/refresh độc lập, request thua trong cuộc đua CAS phía server sẽ
 * bị server coi là dùng lại refresh token đã tiêu thụ (reuse) — giết nhầm
 * phiên đăng nhập hợp lệ. Gộp mọi lời gọi refresh đồng thời thành đúng một
 * request loại bỏ hoàn toàn điều kiện đua này ở phía client.
 */
export class RefreshCoordinator {
  private accessToken: string | null = null;
  private accessTokenExpiresAtMs: number | null = null;
  private inFlight: Promise<string> | null = null;

  constructor(
    private readonly deviceId: string,
    private readonly store: SecretStore,
    private readonly transport: RefreshTransport,
    private readonly onSessionExpired: () => void,
  ) {}

  async setTokens(pair: TokenPair): Promise<void> {
    try {
      await this.store.setTokens(pair);
    } catch (error) {
      throw new SecretStoreError(error);
    }
    this.accessToken = pair.accessToken;
    this.accessTokenExpiresAtMs = decodeJwtExpiryMs(pair.accessToken);
  }

  /** Lấy access token hợp lệ để gắn vào request, tự refresh chủ động nếu sắp hết hạn. */
  async getValidAccessToken(): Promise<string> {
    if (this.accessToken != null && !this.isExpiringSoon()) {
      return this.accessToken;
    }
    return this.refreshNow();
  }

  /** Gọi khi một request đã dùng access token hiện tại vẫn bị từ chối 401. */
  async refreshAfter401(): Promise<string> {
    return this.refreshNow();
  }

  async clearLocalSession(): Promise<void> {
    this.accessToken = null;
    this.accessTokenExpiresAtMs = null;
    await this.store.clear();
  }

  private isExpiringSoon(): boolean {
    if (this.accessTokenExpiresAtMs == null) return false;
    return this.accessTokenExpiresAtMs - Date.now() < PROACTIVE_REFRESH_WINDOW_MS;
  }

  private refreshNow(): Promise<string> {
    if (this.inFlight != null) return this.inFlight;

    const flight = this.performRefresh().finally(() => {
      this.inFlight = null;
    });
    this.inFlight = flight;
    return flight;
  }

  private async performRefresh(): Promise<string> {
    let refreshToken: string | null;
    try {
      refreshToken = await this.store.getRefreshToken();
    } catch (error) {
      throw new SecretStoreError(error);
    }
    if (refreshToken == null) {
      this.onSessionExpired();
      throw new SessionExpiredError();
    }

    let pair: TokenPair;
    try {
      pair = await this.transport.refresh(refreshToken, this.deviceId);
    } catch (error) {
      if (isAuthRejection(error)) {
        this.accessToken = null;
        this.accessTokenExpiresAtMs = null;
        this.onSessionExpired();
        try {
          await this.store.clear();
        } catch (clearError) {
          throw new AggregateError([error, clearError], "Phiên hết hạn nhưng không thể xóa refresh token khỏi kho bảo mật");
        }
        throw new SessionExpiredError();
      }
      // Lỗi mạng/5xx: không đăng xuất, không nuốt lỗi — để tầng gọi tự quyết
      // định (hiện banner mất kết nối, giữ nguyên giỏ hàng đang thao tác).
      throw new NetworkError(error);
    }

    await this.setTokens(pair);
    return pair.accessToken;
  }
}
