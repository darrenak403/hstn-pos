import { useEffect, useRef, useState } from "react";
import axios, { type AxiosInstance } from "axios";
import { isTauri } from "@tauri-apps/api/core";
import { NetworkError, RefreshCoordinator, SecretStoreError, SessionExpiredError, type TokenPair } from "./lib/auth/refresh-coordinator";
import { createRefreshTransport } from "./lib/auth/refresh-transport";
import { selectSecretStoreRuntime } from "./lib/auth/secret-store-runtime";
import { createApiClient } from "./lib/api/client";
import { checkServerReachable, classifyLoginError, type PreflightError } from "./lib/api/preflight";
import { PosWorkspace, type LoggedInUser } from "./screens/PosWorkspace";

declare const __POS_API_BASE_URL__: string;
declare const __POS_PRODUCTION__: boolean;
const API_BASE_URL = __POS_API_BASE_URL__.replace(/\/$/, "");

type Screen =
  | { kind: "CHECKING_SERVER" }
  | { kind: "SERVER_UNREACHABLE"; error: PreflightError }
  | { kind: "UNSUPPORTED_RUNTIME" }
  | { kind: "SECRET_STORE_ERROR" }
  | { kind: "LOGIN_FORM" }
  | { kind: "LOGGED_IN"; user: LoggedInUser };

export function App() {
  const [runtime] = useState(() =>
    selectSecretStoreRuntime({ isTauri: isTauri(), isProduction: __POS_PRODUCTION__, hostname: window.location.hostname }),
  );
  const [screen, setScreen] = useState<Screen>(() =>
    runtime.kind === "unsupported" ? { kind: "UNSUPPORTED_RUNTIME" } : { kind: "CHECKING_SERVER" },
  );
  const [loginError, setLoginError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const deviceIdRef = useRef<string | null>(null);
  const apiRef = useRef<AxiosInstance | null>(null);
  const coordinatorRef = useRef<RefreshCoordinator | null>(null);

  useEffect(() => {
    if (runtime.kind === "unsupported") return;
    const secretStore = runtime.store;
    let cancelled = false;
    void (async () => {
      const preflightError = await checkServerReachable(API_BASE_URL, __POS_PRODUCTION__);
      if (cancelled) return;
      if (preflightError != null) {
        setScreen({ kind: "SERVER_UNREACHABLE", error: preflightError });
        return;
      }
      try {
        const deviceId = await secretStore.getOrCreateDeviceId();
        if (cancelled) return;
        deviceIdRef.current = deviceId;
        const coordinator = new RefreshCoordinator(
          deviceId,
          secretStore,
          createRefreshTransport(API_BASE_URL),
          () => setScreen({ kind: "LOGIN_FORM" }),
        );
        coordinatorRef.current = coordinator;
        apiRef.current = createApiClient(API_BASE_URL, __POS_PRODUCTION__, coordinator);
        const savedToken = await secretStore.getRefreshToken();
        if (savedToken == null) {
          setScreen({ kind: "LOGIN_FORM" });
          return;
        }
        await coordinator.getValidAccessToken();
        const api = apiRef.current;
        if (api == null) throw new Error("Không khởi tạo được kết nối bán hàng");
        const currentUser = await api.get<{ data: LoggedInUser }>("/api/v1/auth/me");
        if (!cancelled) setScreen({ kind: "LOGGED_IN", user: currentUser.data.data });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof SessionExpiredError) { setScreen({ kind: "LOGIN_FORM" }); return; }
        if (error instanceof NetworkError) {
          setScreen({ kind: "SERVER_UNREACHABLE", error: { kind: "SERVER_UNREACHABLE", message: error.message } });
          return;
        }
        setLoginError(error instanceof Error ? error.message : "Kho bảo mật không khả dụng");
        setScreen({ kind: "SECRET_STORE_ERROR" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(username: string, password: string): Promise<void> {
    const deviceId = deviceIdRef.current;
    const coordinator = coordinatorRef.current;
    if (deviceId == null || coordinator == null) return;
    setSubmitting(true);
    setLoginError(null);
    try {
      const response = await axios.post<{ data: TokenPair & { user: LoggedInUser } }>(
        `${API_BASE_URL}/api/v1/auth/login`,
        { username, password, deviceId },
      );
      const { accessToken, refreshToken, user } = response.data.data;
      try {
        await coordinator.setTokens({ accessToken, refreshToken });
      } catch (storeError) {
        try {
          await axios.post(
            `${API_BASE_URL}/api/v1/auth/logout`,
            { deviceId },
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
        } catch (revokeError) {
          throw new AggregateError([storeError, revokeError], "Không lưu được phiên và không thể thu hồi phiên vừa tạo");
        }
        throw storeError;
      }
      setScreen({ kind: "LOGGED_IN", user });
    } catch (error) {
      if (error instanceof SecretStoreError || error instanceof AggregateError) {
        setLoginError("Không thể lưu phiên an toàn trên thiết bị này. Gọi người quản lý để kiểm tra.");
      } else {
        setLoginError(classifyLoginError(error).message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout(): Promise<void> {
    const deviceId = deviceIdRef.current;
    const api = apiRef.current;
    const coordinator = coordinatorRef.current;
    if (deviceId == null || api == null || coordinator == null) return;
    await api.post("/api/v1/auth/logout", { deviceId });
    await coordinator.clearLocalSession();
    setScreen({ kind: "LOGIN_FORM" });
  }

  if (screen.kind === "CHECKING_SERVER") return <CenteredMessage text="Đang kết nối tới máy chủ…" />;
  if (screen.kind === "SERVER_UNREACHABLE") return <CenteredMessage text={screen.error.message} isError />;
  if (screen.kind === "UNSUPPORTED_RUNTIME") {
    return <CenteredMessage text="Bản POS này cần chạy trong ứng dụng desktop hoặc trên localhost ở chế độ phát triển." isError />;
  }
  if (screen.kind === "SECRET_STORE_ERROR") {
    return <CenteredMessage text="Không truy cập được kho bảo mật của thiết bị. Gọi người quản lý để kiểm tra." isError />;
  }
  if (screen.kind === "LOGGED_IN") {
    const api = apiRef.current;
    if (api == null) return <CenteredMessage text="Không khởi tạo được kết nối bán hàng. Hãy mở lại ứng dụng." isError />;
    return <PosWorkspace api={api} user={screen.user} onLogout={handleLogout} />;
  }
  return <LoginForm onSubmit={handleLogin} error={loginError} submitting={submitting} memoryOnly={runtime.kind === "web-dev"} />;
}

function CenteredMessage({ text, isError = false }: { text: string; isError?: boolean }) {
  return <main className="centered-message" role={isError ? "alert" : "status"}>{text}</main>;
}

function LoginForm({
  onSubmit,
  error,
  submitting,
  memoryOnly,
}: {
  onSubmit: (username: string, password: string) => Promise<void>;
  error: string | null;
  submitting: boolean;
  memoryOnly: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={(event) => { event.preventDefault(); void onSubmit(username, password); }}>
        <h1>Seafood POS</h1>
        {memoryOnly && <p className="mode-note" role="status">Web dev: phiên chỉ lưu trong RAM; tải lại trang sẽ cần đăng nhập lại.</p>}
        <label>Tên đăng nhập<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus /></label>
        <label>Mật khẩu<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" /></label>
        {error != null && <p className="error-message" role="alert">{error}</p>}
        <button className="primary-button" disabled={submitting || username.length === 0 || password.length === 0}>
          {submitting ? "Đang đăng nhập…" : "ĐĂNG NHẬP"}
        </button>
      </form>
    </main>
  );
}
