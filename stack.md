# Seafood POS – Production Stack

## 1. Frontend / POS Application

- React
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Router
- TanStack Query
- Zod
- React Hook Form

Desktop Application:

- Tauri 2

Output:

- Windows `.exe` / `.msi`
- Có thể build macOS/Linux sau nếu cần

Frontend chạy như một ứng dụng POS cài trực tiếp trên máy.

---

## 2. Backend

- Node.js LTS
- NestJS
- TypeScript
- REST API
- Swagger / OpenAPI
- Zod hoặc class-validator cho validation
- JWT Access Token
- Refresh Token
- Role-based Authorization

Các module chính:

- Identity
- Category
- Product
- PackagePreset
- Package
- Inventory
- StockIn
- Sales
- Payment
- Reporting
- Audit Log

Kiến trúc:

Modular Monolith

Không sử dụng Microservices ở giai đoạn hiện tại.

---

## 3. Database

Database chính:

- PostgreSQL

ORM:

- Prisma

PostgreSQL là Source of Truth của toàn hệ thống.

Các dữ liệu chính:

- Users
- Roles
- Categories
- Products
- Package Presets
- Packages
- Inventory Transactions
- Stock-In Sessions
- Orders
- Order Items
- Payments
- Audit Logs

---

## 4. Local Storage / Offline

Giai đoạn đầu:

- TanStack Query cache
- IndexedDB nếu cần cache dữ liệu local

Giai đoạn sau:

- SQLite local
- Offline Queue
- Background Sync
- Conflict Resolution

PostgreSQL trên server vẫn là database chính.

SQLite chỉ dùng làm local/offline storage, không phải database trung tâm.

---

## 5. Server vật lý

Server vật lý chạy Linux.

Khuyến nghị:

- Ubuntu Server LTS

Hoặc nếu server hiện tại dùng Proxmox:

```text
Physical Server
      ↓
   Proxmox
      ↓
Ubuntu Server VM
      ↓
Docker
```

Không nên cài trực tiếp toàn bộ application lên Proxmox host.

---

## 6. Containerization

Sử dụng:

- Docker
- Docker Compose

Các container chính:

```text
Docker

├── seafood-api
│   └── NestJS
│
├── postgres
│   └── PostgreSQL
│
└── nginx
    └── Reverse Proxy
```

Có thể thêm sau:

```text
├── redis
├── monitoring
└── backup
```

---

## 7. Reverse Proxy

Sử dụng:

- Nginx

Ví dụ:

```text
api.pos.domain.com
        ↓
      Nginx
        ↓
NestJS :3000
```

Nginx phụ trách:

- HTTPS
- Reverse Proxy
- Compression
- Request forwarding
- Security headers

---

## 8. Domain

Có thể sử dụng:

```text
api.pos.yourdomain.com
```

POS App gọi:

```text
https://api.pos.yourdomain.com
```

Không hard-code IP server vào application.

---

## 9. HTTPS / Network

Khuyến nghị:

- Cloudflare DNS
- HTTPS
- Cloudflare Tunnel hoặc reverse proxy public

Nếu chỉ sử dụng trong nhà:

```text
POS
 ↓
LAN
 ↓
Server
```

vẫn có thể hoạt động mà không cần Internet.

Nếu cần truy cập từ ngoài:

```text
Internet
   ↓
Cloudflare
   ↓
Server
```

---

## 10. Authentication

Sử dụng:

- Username / Password
- JWT Access Token
- Refresh Token

Role:

```text
ADMIN
SELLER
```

Seller:

- Bán hàng
- Thêm hàng
- Xem kho
- Xem doanh thu cơ bản

Admin:

- Quản lý Product
- Category
- Preset
- Giá
- Reporting
- Users
- Audit Log

---

## 11. State Management

Server state:

- TanStack Query

Local UI state:

- Zustand

Không cần Redux nếu application chưa quá phức tạp.

Ví dụ:

```text
TanStack Query
→ Product
→ Inventory
→ Orders
→ Reports

Zustand
→ Cart
→ POS UI
→ Temporary state
```

---

## 12. Form & Validation

Frontend:

- React Hook Form
- Zod

Backend:

- Zod hoặc Nest validation

Shared schema có thể đặt trong:

```text
packages/schemas
```

Frontend và Backend dùng chung schema.

---

## 13. Monorepo

Package Manager:

- pnpm

Monorepo:

- Turborepo

Cấu trúc:

```text
seafood-pos/
│
├── apps/
│   │
│   ├── pos/
│   │   ├── React
│   │   ├── Vite
│   │   └── Tauri
│   │
│   └── api/
│       └── NestJS
│
├── packages/
│   │
│   ├── ui/
│   ├── types/
│   ├── schemas/
│   ├── config/
│   └── utils/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── docker/
│
├── scripts/
│
├── .github/
│   └── workflows/
│
├── docker-compose.yml
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 14. CI/CD

Sử dụng:

- GitHub
- GitHub Actions

Backend flow:

```text
git push
   ↓
GitHub Actions
   ↓
Test
   ↓
Build Docker Image
   ↓
Push Image
   ↓
Deploy Server
   ↓
Docker Compose Pull
   ↓
Restart API
```

Frontend desktop:

```text
Git Tag / Release
        ↓
GitHub Actions
        ↓
Tauri Build
        ↓
.exe / .msi
```

---

## 15. Deployment Architecture

Production:

```text
               POS App
        React + TypeScript
              Tauri
                │
                │ HTTPS
                ▼
        ┌────────────────┐
        │ Physical Server │
        │                 │
        │ Ubuntu VM       │
        │                 │
        │ Docker          │
        │                 │
        │ ┌─────────────┐ │
        │ │    Nginx    │ │
        │ └──────┬──────┘ │
        │        ↓        │
        │ ┌─────────────┐ │
        │ │   NestJS    │ │
        │ │ TypeScript  │ │
        │ └──────┬──────┘ │
        │        ↓        │
        │ ┌─────────────┐ │
        │ │ PostgreSQL  │ │
        │ └─────────────┘ │
        │                 │
        └─────────────────┘
```

---

## 16. Backup

Đây là phần bắt buộc nếu chạy production.

PostgreSQL:

- Daily backup
- Weekly backup
- Backup rotation

Ví dụ:

```text
PostgreSQL
    ↓
pg_dump
    ↓
/backup/postgres/
```

Nên có thêm ít nhất một bản backup nằm ngoài server vật lý.

Ví dụ:

```text
Physical Server
      ↓
Local Backup
      +
Cloud / NAS Backup
```

Không được để database và tất cả backup nằm trên cùng một ổ cứng.

---

## 17. Monitoring

Ban đầu:

- Docker healthcheck
- NestJS `/health`
- PostgreSQL healthcheck
- Structured logs

Có thể thêm sau:

- Uptime Kuma
- Grafana
- Prometheus
- Loki

Nếu muốn đơn giản:

```text
Uptime Kuma
```

là đủ tốt cho giai đoạn đầu.

---

## 18. Logging

Backend nên sử dụng structured logging.

Ví dụ:

- Request ID
- User ID
- Endpoint
- Status
- Duration
- Error

Các hành động nghiệp vụ quan trọng cần Audit Log:

```text
ADMIN changed price

SELLER removed package

SELLER completed order

ADMIN adjusted inventory
```

---

## 19. Security

Production cần:

- HTTPS
- Password hashing
- JWT expiration
- Refresh Token rotation
- Rate limiting
- CORS whitelist
- Helmet
- Input validation
- Role authorization
- Audit logs

Database không expose trực tiếp ra Internet.

Không:

```text
Internet
   ↓
PostgreSQL :5432
```

Mà phải:

```text
Internet
   ↓
Nginx
   ↓
NestJS
   ↓
PostgreSQL
```

---

## 20. Database Network

PostgreSQL chỉ nằm trong Docker/internal network.

Ví dụ:

```text
services:

nginx
  ↓

api
  ↓

postgres
```

Chỉ API được truy cập PostgreSQL.

---

## 21. Cache

MVP:

Không cần Redis.

Sau này nếu cần:

- Session/cache
- Rate limiting
- Distributed locks
- Queue

thì thêm:

```text
Redis
```

Không nên thêm Redis chỉ để làm kiến trúc trông phức tạp hơn.

---

## 22. Queue

MVP:

Không cần RabbitMQ/Kafka.

Nếu sau này cần:

- Background jobs
- Generate report
- Send notifications
- Synchronization jobs

có thể sử dụng:

```text
BullMQ + Redis
```

Không cần message broker riêng.

---

## 23. Mobile / Tablet

Desktop trước:

```text
React
+
Tauri
```

Nếu sau này muốn Android:

```text
React
+
Capacitor
```

Có thể tái sử dụng phần lớn frontend.

---

# 24. Stack cuối cùng

```text
LANGUAGE
TypeScript

FRONTEND
React
Vite
Tailwind CSS
shadcn/ui
TanStack Query
Zustand
React Hook Form
Zod

DESKTOP
Tauri 2

BACKEND
NestJS
Node.js LTS
REST API
Swagger

DATABASE
PostgreSQL

ORM
Prisma

LOCAL/OFFLINE
IndexedDB
SQLite sau này nếu cần

MONOREPO
pnpm
Turborepo

SERVER
Physical Server
Proxmox (nếu đang dùng)
Ubuntu Server VM

CONTAINER
Docker
Docker Compose

PROXY
Nginx

NETWORK
Cloudflare
HTTPS
Cloudflare Tunnel nếu cần

CI/CD
GitHub
GitHub Actions

BACKUP
pg_dump
Local backup
External/cloud backup

MONITORING
Health Check
Uptime Kuma
Grafana/Prometheus sau này

SECURITY
JWT
Refresh Token
RBAC
Rate Limit
Helmet
CORS
Audit Log
```

# 25. Kiến trúc chốt

```text
React + Vite + TypeScript
          │
        Tauri
          │
          │ HTTPS
          ▼
        Nginx
          │
          ▼
NestJS + TypeScript
          │
        Prisma
          │
          ▼
     PostgreSQL
```

Tất cả backend infrastructure chạy trên server vật lý của gia đình thông qua Docker.

PostgreSQL là database trung tâm.

POS được build thành application và cài lên các máy bán hàng.

Toàn bộ hệ thống sử dụng TypeScript làm ngôn ngữ phát triển chính.