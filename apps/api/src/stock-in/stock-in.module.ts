import { Module } from "@nestjs/common";
import { StockInController } from "./stock-in.controller";
import { StockInService } from "./stock-in.service";

@Module({ controllers: [StockInController], providers: [StockInService] })
export class StockInModule {}
