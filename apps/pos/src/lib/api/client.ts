import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { RefreshCoordinator } from "../auth/refresh-coordinator";

interface RetryableConfig extends InternalAxiosRequestConfig {
  __retriedAfter401?: boolean;
}

/**
 * baseUrl luôn phải là https:// kể cả trong mạng LAN nội bộ (xem ADR
 * 0001-token-storage.md): điều này từng bị review đánh dấu là "optional"
 * một cách sai lầm — HTTPS LAN-only qua CA nội bộ (mkcert) vẫn bắt buộc vì
 * access/refresh token đi trên đường truyền này.
 */
export function createApiClient(baseUrl: string, isProd: boolean, coordinator: RefreshCoordinator) {
  if (isProd && !baseUrl.startsWith("https://")) {
    throw new Error(
      `Địa chỉ máy chủ phải dùng https:// ở bản chính thức, nhận được "${baseUrl}". ` +
        "Kiểm tra lại cấu hình trên máy này.",
    );
  }

  const instance = axios.create({ baseURL: baseUrl });

  instance.interceptors.request.use(async (config) => {
    const token = await coordinator.getValidAccessToken();
    config.headers.set("Authorization", `Bearer ${token}`);
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as RetryableConfig | undefined;
      const status = error.response?.status;

      if (status === 401 && config != null && !config.__retriedAfter401) {
        config.__retriedAfter401 = true;
        const token = await coordinator.refreshAfter401();
        config.headers.set("Authorization", `Bearer ${token}`);
        return instance.request(config);
      }

      throw error;
    },
  );

  return instance;
}
