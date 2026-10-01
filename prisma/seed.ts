import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  { name: "Tôm", sortOrder: 1 },
  { name: "Cá", sortOrder: 2 },
  { name: "Mực", sortOrder: 3 },
  { name: "Cua / Ghẹ", sortOrder: 4 },
  { name: "Nghêu / Sò / Ốc", sortOrder: 5 },
  { name: "Bạch tuộc", sortOrder: 6 },
  { name: "Hải sản chế biến", sortOrder: 7 },
];

async function main(): Promise<void> {
  const username = process.env.ADMIN_SEED_USERNAME ?? "admin";
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!password) {
    // Cố ý KHÔNG seed mật khẩu mặc định cứng trong code — buộc người vận hành
    // phải tự đặt mật khẩu qua .env trước khi seed lần đầu.
    throw new Error("Thiếu ADMIN_SEED_PASSWORD trong biến môi trường, xem .env.example");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { username },
    update: {},
    create: { username, passwordHash, displayName: "Quản lý", role: "ADMIN" },
  });

  for (const category of DEFAULT_CATEGORIES) {
    const existing = await prisma.category.findFirst({ where: { name: category.name } });
    if (existing == null) {
      await prisma.category.create({ data: category });
    }
  }

  console.log(`Seed xong: user "${username}" (ADMIN) + ${DEFAULT_CATEGORIES.length} category mặc định`);
}

main()
  .catch((error: unknown) => {
    console.error("Seed thất bại:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
