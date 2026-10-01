import { Prisma } from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { OrdersService } from "./orders.service";

function buildPackage(id: string, sellingPrice: string, status = "IN_STOCK") {
  return {
    id,
    code: `TS${id}`,
    productId: "product-1",
    actualWeight: new Prisma.Decimal("0.5"),
    pricePerUnit: new Prisma.Decimal("450000"),
    sellingPrice: new Prisma.Decimal(sellingPrice),
    estimatedCost: null,
    status,
    product: { name: "Cá hồi" },
  };
}

function buildService(packages: ReturnType<typeof buildPackage>[]) {
  type CreateOrderArgs = {
    data: {
      code: string;
      totalAmount: Prisma.Decimal;
      payments: { create: { method: "CASH" | "TRANSFER"; amount: Prisma.Decimal } };
    };
  };
  const createOrder = jest.fn(async ({ data }: CreateOrderArgs) => ({
    id: "order-1",
    code: data.code,
    totalAmount: data.totalAmount,
    items: [],
    payments: [],
  }));
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(packages.map(({ id }) => ({ id }))),
    package: {
      findMany: jest.fn().mockResolvedValue(packages),
      updateMany: jest.fn().mockResolvedValue({ count: packages.length }),
    },
    order: { create: createOrder },
    inventoryTransaction: { createMany: jest.fn().mockResolvedValue({ count: packages.length }) },
    auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  return { service: new OrdersService(prisma as never), tx, createOrder };
}

describe("OrdersService.create", () => {
  it("tính tổng từ giá Package trong CSDL rồi ghi thanh toán và giao dịch kho cùng đơn", async () => {
    const { service, tx, createOrder } = buildService([buildPackage("0002", "234000"), buildPackage("0001", "250000")]);

    await service.create({ packageIds: ["0002", "0001"], paymentMethod: "CASH" }, "seller-1");

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const createdOrder = createOrder.mock.calls[0]?.[0];
    if (createdOrder == null) throw new Error("OrdersService chưa tạo đơn hàng");
    expect(createdOrder.data.totalAmount.toFixed()).toBe("484000");
    expect(createdOrder.data.payments.create.method).toBe("CASH");
    expect(createdOrder.data.payments.create.amount.toFixed()).toBe("484000");
    expect(tx.package.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["0001", "0002"] }, status: "IN_STOCK" },
      data: { status: "SOLD" },
    });
    expect(tx.inventoryTransaction.createMany).toHaveBeenCalledTimes(1);
  });

  it("không tạo đơn hoặc giao dịch kho nếu có hộp đã bán", async () => {
    const { service, tx, createOrder } = buildService([buildPackage("0001", "234000", "SOLD")]);

    await expect(service.create({ packageIds: ["0001"], paymentMethod: "TRANSFER" }, "seller-1"))
      .rejects.toBeInstanceOf(ConflictException);

    expect(createOrder).not.toHaveBeenCalled();
    expect(tx.inventoryTransaction.createMany).not.toHaveBeenCalled();
  });
});
