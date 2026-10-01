import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module";
import { AuditLogModule } from "./audit-log/audit-log.module";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health/health.controller";
import { CatalogModule } from "./catalog/catalog.module";
import { StockInModule } from "./stock-in/stock-in.module";
import { InventoryModule } from "./inventory/inventory.module";
import { OrdersModule } from "./orders/orders.module";
import { ReportsModule } from "./reports/reports.module";
import { UsersModule } from "./users/users.module";
import { SettingsModule } from "./settings/settings.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditLogModule,
    AuthModule,
    CatalogModule,
    StockInModule,
    InventoryModule,
    OrdersModule,
    ReportsModule,
    UsersModule,
    SettingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
