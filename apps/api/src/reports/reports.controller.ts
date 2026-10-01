import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { DashboardQuerySchema, ReportQuerySchema, type ReportQuery } from "@seafood-pos/schemas";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ReportsService } from "./reports.service";

@Controller("api/v1")
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("reports/dashboard")
  async dashboard(@Query(new ZodValidationPipe(DashboardQuerySchema)) query: { date?: string }) {
    return { data: await this.reports.dashboard(query.date), message: { code: "DASHBOARD", text: "Tổng kết bán hàng" } };
  }

  @Get("reports/sales")
  async sales(@Query(new ZodValidationPipe(ReportQuerySchema)) query: ReportQuery) {
    return { data: await this.reports.sales(query), message: { code: "SALES_REPORT", text: "Báo cáo bán hàng" } };
  }

  @Get("products/frequent")
  async frequent() {
    return { data: await this.reports.frequent(), message: { code: "FREQUENT_PRODUCTS", text: "Sản phẩm bán nhiều" } };
  }
}
