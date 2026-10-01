CREATE TYPE "Role" AS ENUM ('ADMIN', 'SELLER');
CREATE TYPE "RefreshTokenRevokedReason" AS ENUM ('ROTATED', 'REUSE_DETECTED', 'DEVICE_MISMATCH', 'ADMIN_REVOKED', 'USER_INACTIVE', 'LOGOUT', 'EXPIRED_CLEANUP');
CREATE TYPE "AuditCategory" AS ENUM ('BUSINESS', 'SECURITY');
CREATE TYPE "PricingType" AS ENUM ('WEIGHT_BASED', 'FIXED_PACKAGE');
CREATE TYPE "PackageStatus" AS ENUM ('IN_STOCK', 'SOLD', 'DAMAGED', 'REMOVED');
CREATE TYPE "PriceBasis" AS ENUM ('OVERRIDE_PER_UNIT', 'PRESET_FIXED', 'PRESET_PER_UNIT', 'PRODUCT_PER_UNIT', 'OVERRIDE_FIXED', 'PRODUCT_FIXED');
CREATE TYPE "OrderStatus" AS ENUM ('COMPLETED', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER');
CREATE TYPE "InventoryTransactionType" AS ENUM ('CREATE', 'SALE', 'SALE_REVERSED', 'DAMAGED', 'REMOVED');
CREATE TYPE "AdjustmentReason" AS ENUM ('DAMAGED', 'PACKAGING_TORN', 'HOME_USE', 'GIFT', 'WRONG_ENTRY', 'STOCKTAKE_DIFF', 'OTHER');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

CREATE TABLE "RefreshToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "deviceLabel" TEXT,
  "familyId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "rotatedToTokenId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokedReason" "RefreshTokenRevokedReason",
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
CREATE INDEX "RefreshToken_deviceId_idx" ON "RefreshToken"("deviceId");

CREATE TABLE "RefreshTokenGrace" (
  "oldTokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "newAccessToken" TEXT NOT NULL,
  "newRefreshToken" TEXT NOT NULL,
  "newRefreshTokenId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefreshTokenGrace_pkey" PRIMARY KEY ("oldTokenHash")
);
CREATE INDEX "RefreshTokenGrace_expiresAt_idx" ON "RefreshTokenGrace"("expiresAt");

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "category" "AuditCategory" NOT NULL,
  "action" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "actorId" TEXT,
  "actorUsernameAttempted" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "metadata" JSONB,
  "ip" TEXT,
  "userAgent" TEXT,
  "deviceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AuditLog_category_createdAt_idx" ON "AuditLog"("category", "createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

CREATE TABLE "AppSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "Category" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "imageUrl" TEXT,
  "icon" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "imageUrl" TEXT,
  "code" TEXT NOT NULL,
  "baseUnit" TEXT NOT NULL DEFAULT 'kg',
  "pricingType" "PricingType" NOT NULL,
  "defaultPricePerUnit" DECIMAL(18,2),
  "defaultFixedPrice" DECIMAL(18,2),
  "estimatedCostPerUnit" DECIMAL(18,2),
  "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
  "packageSequence" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
CREATE INDEX "Product_categoryId_isActive_idx" ON "Product"("categoryId", "isActive");

CREATE TABLE "PackagePreset" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "weight" DECIMAL(10,3),
  "pricePerUnit" DECIMAL(18,2),
  "fixedPrice" DECIMAL(18,2),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "PackagePreset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PackagePreset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "StockInSession" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "StockInSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockInSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StockInSession_code_key" ON "StockInSession"("code");

CREATE TABLE "Package" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "packagePresetId" TEXT,
  "code" TEXT NOT NULL,
  "barcode" TEXT,
  "actualWeight" DECIMAL(10,3) NOT NULL,
  "pricePerUnit" DECIMAL(18,2),
  "sellingPrice" DECIMAL(18,2) NOT NULL,
  "priceBasis" "PriceBasis" NOT NULL,
  "estimatedCost" DECIMAL(18,2),
  "status" "PackageStatus" NOT NULL DEFAULT 'IN_STOCK',
  "stockInSessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "Package_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Package_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Package_packagePresetId_fkey" FOREIGN KEY ("packagePresetId") REFERENCES "PackagePreset"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Package_stockInSessionId_fkey" FOREIGN KEY ("stockInSessionId") REFERENCES "StockInSession"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Package_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "package_price_basis_consistency" CHECK (
    ("priceBasis" IN ('OVERRIDE_FIXED', 'PRESET_FIXED', 'PRODUCT_FIXED') AND "pricePerUnit" IS NULL)
    OR ("priceBasis" IN ('OVERRIDE_PER_UNIT', 'PRESET_PER_UNIT', 'PRODUCT_PER_UNIT') AND "pricePerUnit" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "Package_code_key" ON "Package"("code");
CREATE UNIQUE INDEX "Package_barcode_key" ON "Package"("barcode");
CREATE INDEX "Package_productId_status_idx" ON "Package"("productId", "status");

CREATE TABLE "StockInLineAudit" (
  "id" TEXT NOT NULL,
  "stockInSessionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "overrideType" "PriceBasis" NOT NULL,
  "overrideValue" DECIMAL(18,2) NOT NULL,
  "defaultValue" DECIMAL(18,2),
  "deviationPercent" DECIMAL(6,3),
  "withinThreshold" BOOLEAN NOT NULL,
  "approvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockInLineAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockInLineAudit_stockInSessionId_fkey" FOREIGN KEY ("stockInSessionId") REFERENCES "StockInSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockInLineAudit_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'COMPLETED',
  "totalAmount" DECIMAL(18,2) NOT NULL,
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PAID',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "cancelledById" TEXT,
  "cancelReason" TEXT,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Order_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Order_code_key" ON "Order"("code");
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

CREATE TABLE "OrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productNameSnapshot" TEXT NOT NULL,
  "packageCodeSnapshot" TEXT NOT NULL,
  "weight" DECIMAL(10,3) NOT NULL,
  "unitPrice" DECIMAL(18,2),
  "sellingPrice" DECIMAL(18,2) NOT NULL,
  "estimatedCostSnapshot" DECIMAL(18,2),
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "InventoryTransaction" (
  "id" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "type" "InventoryTransactionType" NOT NULL,
  "reason" "AdjustmentReason",
  "note" TEXT,
  "orderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryTransaction_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "InventoryTransaction_packageId_createdAt_idx" ON "InventoryTransaction"("packageId", "createdAt");
