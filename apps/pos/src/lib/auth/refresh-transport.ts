import axios from "axios";
import type { RefreshTransport, TokenPair } from "./refresh-coordinator";

/**
 * Transport refresh dùng axios TRẦN (không đi qua interceptor của client.ts)
 * — tránh vòng lặp: interceptor của client.ts gọi lại chính coordinator này
 * mỗi khi gặp 401, nên bản thân việc gọi POST /auth/refresh không được phép
 * đi qua interceptor đó.
 */
export function createRefreshTransport(baseUrl: string): RefreshTransport {
  return {
    async refresh(refreshToken: string, deviceId: string): Promise<TokenPair> {
      try {
        const response = await axios.post<{ data: TokenPair }>(`${baseUrl}/api/v1/auth/refresh`, {
          refreshToken,
          deviceId,
        });
        return response.data.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          throw { status: 401 };
        }
        throw error;
      }
    },
  };
}
