import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
  CatalogListQuerySchema,
  CategoryStatusRequestSchema,
  CreateCategoryRequestSchema,
  CreateProductRequestSchema,
  PackagePresetInputSchema,
  PackagePresetStatusRequestSchema,
  ProductStatusRequestSchema,
  UpdateCategoryRequestSchema,
  UpdateProductRequestSchema,
  type CatalogListQuery,
  type CreateCategoryRequest,
  type CreateProductRequest,
  type PackagePresetInput,
} from "@seafood-pos/schemas";
import { CatalogService } from "./catalog.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";

@Controller("api/v1")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("categories")
  async categories(
    @Query(new ZodValidationPipe(CatalogListQuerySchema)) query: CatalogListQuery,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (query.includeInactive && user.role !== "ADMIN") throw new ForbiddenException("Chỉ Quản lý được xem danh mục đã ẩn");
    return { data: await this.catalog.listCategories(query.includeInactive), message: { code: "CATEGORIES", text: "Danh mục" } };
  }

  @Post("categories")
  @Roles("ADMIN")
  async createCategory(
    @Body(new ZodValidationPipe(CreateCategoryRequestSchema)) input: CreateCategoryRequest,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return { data: await this.catalog.createCategory(input, user.id), message: { code: "CATEGORY_CREATED", text: "Đã tạo danh mục" } };
  }

  @Put("categories/:id")
  @Roles("ADMIN")
  async updateCategory(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCategoryRequestSchema)) input: CreateCategoryRequest,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return { data: await this.catalog.updateCategory(id, input, user.id), message: { code: "CATEGORY_UPDATED", text: "Đã cập nhật danh mục" } };
  }

  @Patch("categories/:id/active")
  @Roles("ADMIN")
  async setCategoryActive(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CategoryStatusRequestSchema)) body: { isActive: boolean },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return { data: await this.catalog.setCategoryActive(id, body.isActive, user.id), message: { code: "CATEGORY_STATUS_UPDATED", text: "Đã cập nhật trạng thái danh mục" } };
  }

  @Get("products")
  async products(
    @Query(new ZodValidationPipe(CatalogListQuerySchema)) query: CatalogListQuery,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (query.includeInactive && user.role !== "ADMIN") throw new ForbiddenException("Chỉ Quản lý được xem sản phẩm đã ẩn");
    return { data: await this.catalog.listProducts(query), message: { code: "PRODUCTS", text: "Sản phẩm" } };
  }

  @Get("products/:id")
  async product(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.catalog.getProduct(id), message: { code: "PRODUCT", text: "Chi tiết sản phẩm" } };
  }

  @Post("products")
  @Roles("ADMIN")
  async createProduct(
    @Body(new ZodValidationPipe(CreateProductRequestSchema)) input: CreateProductRequest,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return { data: await this.catalog.createProduct(input, user.id), message: { code: "PRODUCT_CREATED", text: "Đã tạo sản phẩm" } };
  }

  @Put("products/:id")
  @Roles("ADMIN")
  async updateProduct(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateProductRequestSchema)) input: CreateProductRequest,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return { data: await this.catalog.updateProduct(id, input, user.id), message: { code: "PRODUCT_UPDATED", text: "Đã cập nhật sản phẩm" } };
  }

  @Patch("products/:id/active")
  @Roles("ADMIN")
  async setProductActive(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ProductStatusRequestSchema)) body: { isActive: boolean },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return { data: await this.catalog.setProductActive(id, body.isActive, user.id), message: { code: "PRODUCT_STATUS_UPDATED", text: "Đã cập nhật trạng thái sản phẩm" } };
  }

  @Post("products/:productId/presets")
  @Roles("ADMIN")
  async createPreset(
    @Param("productId", ParseUUIDPipe) productId: string,
    @Body(new ZodValidationPipe(PackagePresetInputSchema)) input: PackagePresetInput,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return { data: await this.catalog.createPreset(productId, input, user.id), message: { code: "PRESET_CREATED", text: "Đã tạo mẫu hộp" } };
  }

  @Put("products/:productId/presets/:presetId")
  @Roles("ADMIN")
  async updatePreset(
    @Param("productId", ParseUUIDPipe) productId: string,
    @Param("presetId", ParseUUIDPipe) presetId: string,
    @Body(new ZodValidationPipe(PackagePresetInputSchema)) input: PackagePresetInput,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return { data: await this.catalog.updatePreset(productId, presetId, input, user.id), message: { code: "PRESET_UPDATED", text: "Đã cập nhật mẫu hộp" } };
  }

  @Patch("products/:productId/presets/:presetId/active")
  @Roles("ADMIN")
  async setPresetActive(
    @Param("productId", ParseUUIDPipe) productId: string,
    @Param("presetId", ParseUUIDPipe) presetId: string,
    @Body(new ZodValidationPipe(PackagePresetStatusRequestSchema)) body: { isActive: boolean },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return { data: await this.catalog.setPresetActive(productId, presetId, body.isActive, user.id), message: { code: "PRESET_STATUS_UPDATED", text: "Đã cập nhật trạng thái mẫu hộp" } };
  }
}
