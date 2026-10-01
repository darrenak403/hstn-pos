# Migration

`20261001000000_initial/migration.sql` tạo schema PostgreSQL đầy đủ và chứa
CHECK constraint bảo đảm `Package.priceBasis` nhất quán với `pricePerUnit`.
Áp dụng schema bằng `pnpm db:migrate` (dev) hoặc `pnpm exec prisma migrate deploy`
(production). Không cần chạy SQL bổ sung thủ công.
