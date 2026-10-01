import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { ResponseEnvelopeInterceptor } from "./common/interceptors/response-envelope.interceptor";

// Origin của app CLIENT (Tauri/web) được phép gọi API — KHÔNG phải domain của
// chính API server. Đây từng bị cấu hình nhầm thành "https://api.pos.lan" (domain
// của server), nên trong production thật request từ app Tauri đóng gói sẽ luôn bị
// CORS chặn vì không origin nào khớp. Tauri v2 chạy app đã đóng gói dưới
// "tauri://localhost" (macOS/Linux) hoặc "http(s)://tauri.localhost" (Windows
// WebView2) — không bao giờ dùng "*" (luôn whitelist tường minh, xem stack.md §19).
const DEFAULT_CORS_ORIGINS = ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"];

function resolveCorsOrigins(env: NodeJS.ProcessEnv): string[] {
  const raw = env.CORS_ORIGIN;
  if (raw == null || raw.trim() === "") {
    return env["NODE_ENV"] === "production"
      ? DEFAULT_CORS_ORIGINS
      : [...DEFAULT_CORS_ORIGINS, "http://localhost:1420"];
  }
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());

  app.enableCors({ origin: resolveCorsOrigins(process.env), credentials: true });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  Logger.error("Không khởi động được API", error instanceof Error ? error.stack : String(error), "Bootstrap");
  process.exit(1);
});
