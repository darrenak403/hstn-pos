export type PreflightError =
  | { kind: "DNS_NOT_RESOLVED"; message: string }
  | { kind: "SERVER_UNREACHABLE"; message: string }
  | { kind: "TLS_INVALID"; message: string }
  | { kind: "UNAUTHORIZED"; message: string };

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Phân loại lỗi fetch() thành 4 nhóm hiển thị cho người dùng lớn tuổi.
 *
 * WebView (WebView2/WKWebView) không trả mã lỗi chi tiết cho fetch() thất
 * bại như Node.js — đây là suy đoán tốt nhất dựa trên nội dung thông điệp,
 * KHÔNG phải phân loại chắc chắn 100%. Nếu môi trường thực tế cho message
 * khác, cập nhật từ khoá nhận diện ở đây — xem docs/ops/network-dns.md.
 */
function classifyFetchError(error: unknown, baseUrl?: string): PreflightError {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const hostname = baseUrl ? safeHostname(baseUrl) : null;

  if (
    message.includes("name_not_resolved") ||
    message.includes("enotfound") ||
    message.includes("getaddrinfo") ||
    message.includes("err_name_not_resolved")
  ) {
    return {
      kind: "DNS_NOT_RESOLVED",
      message: hostname
        ? `Không tìm thấy máy chủ "${hostname}". Máy này có thể chưa được cài đặt đúng, gọi người quản lý.`
        : "Không tìm thấy máy chủ. Gọi người quản lý để kiểm tra.",
    };
  }

  if (message.includes("cert") || message.includes("ssl") || message.includes("tls")) {
    return {
      kind: "TLS_INVALID",
      message: "Chứng chỉ bảo mật của máy chủ không hợp lệ. Gọi người quản lý để kiểm tra.",
    };
  }

  return {
    kind: "SERVER_UNREACHABLE",
    message: "Không kết nối được máy chủ. Kiểm tra mạng Wi-Fi / dây mạng rồi thử lại.",
  };
}

export function classifyLoginError(error: unknown): PreflightError {
  if (typeof error === "object" && error !== null && "response" in error) {
    const status = (error as { response?: { status?: unknown } }).response?.status;
    if (status === 401) {
      return { kind: "UNAUTHORIZED", message: "Sai tên đăng nhập hoặc mật khẩu" };
    }
  }
  return classifyFetchError(error);
}

export async function checkServerReachable(baseUrl: string, requireHttps = true): Promise<PreflightError | null> {
  if (requireHttps && !baseUrl.startsWith("https://")) {
    return {
      kind: "TLS_INVALID",
      message: `Địa chỉ máy chủ phải bắt đầu bằng https://, nhận được "${baseUrl}"`,
    };
  }

  try {
    const response = await fetch(`${baseUrl}/health`, { method: "GET" });
    if (!response.ok && response.status !== 401) {
      return { kind: "SERVER_UNREACHABLE", message: `Máy chủ phản hồi lỗi (${response.status})` };
    }
    return null;
  } catch (error) {
    return classifyFetchError(error, baseUrl);
  }
}
