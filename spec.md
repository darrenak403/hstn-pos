# Seafood POS – Product Spec v0.3

## 1. Tổng quan

Seafood POS là hệ thống bán hàng và quản lý tồn kho dành cho cửa hàng hải sản đông lạnh gia đình.

Cửa hàng tự chuẩn bị, sơ chế hoặc đóng gói sản phẩm để bán, vì vậy hệ thống không tập trung vào quy trình mua hàng từ nhà cung cấp.

Quy trình nghiệp vụ chính:

Sản phẩm

→ Đóng gói / tạo hàng

→ Đưa thành phẩm vào kho

→ Bán hàng

→ Theo dõi tồn kho và doanh thu

Hệ thống hỗ trợ nhiều loại sản phẩm khác nhau như:

- Tôm
- Cá
- Mực
- Cua / Ghẹ
- Nghêu / Sò / Ốc
- Bạch tuộc
- Hải sản chế biến
- Các sản phẩm khác

Mỗi sản phẩm có thể có nhiều hộp/gói với:

- Khối lượng khác nhau
- Giá khác nhau
- Giá/kg khác nhau
- Quy cách đóng gói khác nhau

---

# 2. Người dùng chính

## Người bán hàng

Đối tượng chính có thể là ba mẹ hoặc người lớn tuổi.

Các thao tác thường xuyên:

- Bán hàng
- Tạo thêm hàng vào kho
- Xem còn bao nhiêu hàng
- Xem doanh thu trong ngày

Yêu cầu UX:

- Chữ lớn
- Nút lớn
- Ít bước
- Có hình ảnh sản phẩm
- Hạn chế nhập bàn phím
- Không sử dụng thuật ngữ kỹ thuật

## Người quản lý

Có thể:

- Quản lý danh mục
- Quản lý sản phẩm
- Quản lý mẫu đóng gói
- Quản lý giá
- Kiểm tra tồn kho
- Xem lịch sử kho
- Xem doanh thu và lợi nhuận
- Quản lý người dùng

---

# 3. Mô hình nghiệp vụ cốt lõi

Cấu trúc:

Category

→ Product

→ Package Preset

→ Package

Trong đó:

- Category: nhóm sản phẩm
- Product: loại sản phẩm
- Package Preset: mẫu đóng gói thường dùng
- Package: hộp/gói thực tế đang tồn tại

Ví dụ:

Cá

→ Cá hồi

→ Mẫu 500g

→ Hộp CF000123

---

# 4. Category

Category dùng để nhóm sản phẩm.

Ví dụ:

- Tôm
- Cá
- Mực
- Cua / Ghẹ
- Sò / Ốc
- Đồ chế biến
- Khác

Thông tin:

- ID
- Tên
- Hình ảnh
- Icon
- Thứ tự hiển thị
- Trạng thái

Category có thể được tạo thêm mà không cần sửa code.

---

# 5. Product

Product đại diện cho một loại sản phẩm.

Ví dụ:

- Tôm sú
- Tôm thẻ
- Cá hồi
- Cá saba
- Cá thu
- Mực ống
- Bạch tuộc

Thông tin:

- ID
- Category
- Tên
- Hình ảnh
- Mã sản phẩm
- Đơn vị cơ sở
- Kiểu giá
- Giá mặc định
- Trạng thái

---

# 6. Kiểu định giá

Product hỗ trợ tối thiểu:

## WEIGHT_BASED

Tính theo khối lượng.

Ví dụ:

Tôm sú

250.000đ/kg

Hộp:

1.2kg

Thành tiền:

300.000đ

## FIXED_PACKAGE

Giá cố định theo hộp.

Ví dụ:

Chả cá 500g

120.000đ/hộp

---

# 7. Package Preset

Package Preset là các mẫu đóng gói thường xuyên được sử dụng.

Ví dụ:

Cá hồi:

- 250g – 120.000đ
- 500g – 230.000đ
- 1kg – 450.000đ

Tôm sú:

- 500g – 125.000đ
- 1kg – 250.000đ
- 1.5kg – 375.000đ

Mỗi Product có bộ Preset riêng.

Preset chỉ là mẫu.

Preset không phải hàng tồn kho thực tế.

---

# 8. Package

Package là một hộp hoặc gói hàng thực tế có thể được bán.

Ví dụ:

Code:

TS00042

Product:

Tôm sú

Weight:

1.08kg

Price:

270.000đ

Status:

IN_STOCK

Một Product có thể có rất nhiều Package.

---

# 9. Hàng thực tế có thể khác Preset

Ví dụ Product có preset:

1kg – 250.000đ

Nhưng khi đóng gói thực tế có hộp:

1.08kg

Hệ thống cho phép nhập:

1.08kg

và tự tính:

1.08 × 250.000

=

270.000đ

Package này vẫn thuộc Product Tôm sú.

Không cần tạo Product mới.

---

# 10. Tạo hàng / Đưa thành phẩm vào kho

Thay vì "Phiếu nhập hàng", hệ thống sử dụng chức năng:

TẠO HÀNG

hoặc:

THÊM VÀO KHO

Đây là hành động ghi nhận những hộp/gói mà gia đình vừa làm hoặc đóng gói xong.

Flow:

Thêm vào kho

→ Chọn Category

→ Chọn Product

→ Chọn mẫu hộp

→ Chọn số lượng

→ Xác nhận

Ví dụ:

Tôm

→ Tôm sú

→ 1kg – 250.000đ

→ 10 hộp

Hệ thống tạo 10 Package.

---

# 11. Tạo nhiều hộp giống nhau

Ví dụ vừa đóng:

10 hộp Cá hồi 500g

Người dùng không phải tạo từng hộp.

Chỉ cần:

Cá hồi

500g – 230.000đ

Số lượng:

10

Xác nhận

Hệ thống tự tạo:

CF001

CF002

CF003

...

CF010

---

# 12. Tạo hộp có khối lượng khác

Nếu hộp không giống Preset:

Người dùng chọn:

Khối lượng khác

Ví dụ:

0.72kg

Nếu Product có giá:

450.000đ/kg

Hệ thống tự tính:

324.000đ

Sau đó:

THÊM VÀO KHO

---

# 13. Tạo nhiều hộp khác khối lượng

Hệ thống nên hỗ trợ trường hợp vừa đóng một loạt hộp:

Cá hồi:

- 0.52kg
- 0.48kg
- 0.71kg
- 1.02kg
- 0.85kg

Thay vì phải đi qua lại nhiều màn hình, có thể có chế độ:

Thêm nhiều hộp

Ví dụ:

CÁ HỒI

Giá/kg: 450.000đ

Hộp 1: 0.52kg → 234.000đ

Hộp 2: 0.48kg → 216.000đ

Hộp 3: 0.71kg → 319.500đ

Hộp 4: 1.02kg → 459.000đ

[THÊM TẤT CẢ VÀO KHO]

---

# 14. Lưu mẫu mới

Nếu một khối lượng được sử dụng thường xuyên:

Ví dụ:

750g

Người quản lý có thể:

Lưu làm mẫu

Từ lần sau:

750g

xuất hiện trực tiếp trong danh sách lựa chọn.

---

# 15. Bán hàng

Flow chính:

BÁN HÀNG

→ Chọn Category

→ Chọn Product

→ Chọn Package

→ Giỏ hàng

→ Thanh toán

Ví dụ:

Cá

→ Cá hồi

Hệ thống hiển thị:

500g – 230.000đ

520g – 239.000đ

720g – 324.000đ

1kg – 450.000đ

Người bán chọn đúng hộp khách lấy.

---

# 16. Tìm sản phẩm

Người dùng có thể:

- Chọn theo Category
- Tìm theo tên
- Tìm theo mã
- Quét barcode
- Chọn sản phẩm thường bán

Ví dụ nhập:

"Mực"

Hiển thị:

- Mực ống
- Mực lá
- Mực nang

---

# 17. Sản phẩm bán thường xuyên

POS nên có vùng:

BÁN NHIỀU

Ví dụ:

- Tôm sú
- Cá hồi
- Mực ống
- Cá saba
- Bạch tuộc

Ba mẹ có thể bấm trực tiếp mà không cần đi qua Category.

---

# 18. Giỏ hàng

Ví dụ:

Cá hồi

0.52kg

239.000đ

Tôm sú

1kg

250.000đ

Mực ống

0.8kg

175.000đ

TỔNG

664.000đ

Thao tác:

- Xóa
- Sửa
- Hủy đơn
- Thanh toán

---

# 19. Thanh toán

MVP:

- Tiền mặt
- Chuyển khoản

Có thể mở rộng:

- QR
- Ghi nợ
- Thanh toán một phần

---

# 20. Kho

Kho phải hiển thị cả hai chỉ số:

Số hộp

và:

Tổng khối lượng

Ví dụ:

Tôm sú

32 hộp

28.75kg

Không được chỉ lưu:

Stock = 32

vì khối lượng từng hộp không giống nhau.

---

# 21. Chi tiết tồn kho

Ví dụ:

TÔM SÚ

Còn:

32 hộp

28.75kg

Danh sách:

TS001

0.82kg

205.000đ

TS002

1kg

250.000đ

TS003

1.08kg

270.000đ

TS004

1.5kg

375.000đ

---

# 22. Trạng thái Package

Package có:

IN_STOCK

Còn hàng

SOLD

Đã bán

DAMAGED

Hư hỏng

REMOVED

Đã lấy ra khỏi kho

Có thể mở rộng:

RESERVED

EXPIRED

RETURNED

---

# 23. Điều chỉnh kho

Một hộp có thể rời kho mà không phải do bán.

Ví dụ:

- Hỏng
- Rách bao bì
- Nhà dùng
- Biếu / tặng
- Nhập sai
- Kiểm kho phát hiện sai

Người dùng chọn:

ĐIỀU CHỈNH KHO

→ Chọn Package

→ Chọn lý do

→ Xác nhận

---

# 24. Inventory Transaction

Mọi thay đổi về Package phải được lưu lịch sử.

Ví dụ:

CREATE

TS001

Tạo mới vào kho

SALE

TS001

Đã bán

DAMAGED

TS002

Hàng hỏng

REMOVED

TS003

Lấy khỏi kho

Không xóa dữ liệu lịch sử chỉ vì hàng không còn tồn.

---

# 25. Production / Stock-In Session

Không cần Purchase Order.

Tuy nhiên hệ thống có thể có một khái niệm nhẹ hơn:

Stock-In Session

dùng để nhóm những Package được tạo cùng một lần.

Ví dụ:

Ngày 01/10/2026

Buổi đóng hàng sáng

Tạo:

- 10 hộp Tôm sú
- 8 hộp Cá hồi
- 12 hộp Mực ống

Mục đích chỉ để tra cứu lịch sử.

Người bán không bắt buộc phải hiểu hoặc thao tác với khái niệm này.

Trong UI có thể chỉ gọi:

"Lần thêm hàng"

---

# 26. Giá vốn

Vì gia đình tự làm hàng, giá vốn không nhất thiết đến từ giá nhập.

Nếu cần tính lợi nhuận sau này, Admin có thể cấu hình:

Estimated Cost

Ví dụ:

Tôm sú

Chi phí ước tính:

180.000đ/kg

Giá bán:

250.000đ/kg

Hệ thống có thể ước tính lợi nhuận.

Tính năng này không bắt buộc trong MVP.

---

# 27. Màn hình chính

Giao diện cho người bán:

BÁN HÀNG

THÊM HÀNG

XEM KHO

DOANH THU

Không cần hiển thị:

Purchase

Supplier

Batch Management

Cost Accounting

trên màn hình chính.

---

# 28. UX cho người lớn tuổi

## Ưu tiên hình ảnh

Ví dụ:

[Tôm sú + ảnh]

[Cá hồi + ảnh]

[Mực ống + ảnh]

## Nút lớn

Dùng tốt trên tablet và màn hình cảm ứng.

## Giá và kg phải nổi bật

Ví dụ:

1.2 KG

300.000đ

lớn hơn các thông tin phụ.

## Hạn chế gõ

Nếu đã có:

1kg – 250.000đ

thì chỉ cần bấm vào.

## Không dùng thuật ngữ kỹ thuật

Thay:

Package Preset

bằng:

Mẫu hộp

Thay:

Inventory

bằng:

Kho

Thay:

Stock In

bằng:

Thêm hàng

Thay:

Inventory Adjustment

bằng:

Điều chỉnh kho

---

# 29. Xác nhận rõ ràng

Ví dụ:

ĐÃ THÊM HÀNG

Tôm sú

10 hộp

10kg

thay vì:

Success.

---

# 30. Hoàn tác

Nếu bấm nhầm:

Đã xóa Cá hồi 500g khỏi đơn

[HOÀN TÁC]

Các thao tác nguy hiểm nên:

- Có xác nhận
- Hoặc có Undo

---

# 31. Phân quyền

## Seller

Có thể:

- Bán hàng
- Thêm hàng
- Xem kho
- Xem doanh thu cơ bản
- Điều chỉnh kho cơ bản

## Admin

Có thêm:

- Category
- Product
- Preset
- Giá
- Lịch sử kho
- Báo cáo
- User
- Settings

---

# 32. Dashboard

Ví dụ:

HÔM NAY

Doanh thu

8.500.000đ

Đơn hàng

27

Đã bán

43 hộp

51.2kg

Sắp hết:

Tôm sú

4 hộp

Cá hồi

5 hộp

Mực ống

3 hộp

---

# 33. Barcode

Mỗi Package có thể có Barcode riêng.

Ví dụ tem:

CÁ HỒI

0.52 KG

239.000đ

CF00125

[BARCODE]

Khi bán:

Quét

→ tìm Package

→ thêm vào giỏ

Không bắt buộc trong MVP nhưng nên thiết kế database hỗ trợ sẵn.

---

# 34. Data Model cốt lõi

## Category

- Id
- Name
- Image
- SortOrder
- IsActive

## Product

- Id
- CategoryId
- Name
- Image
- Code
- BaseUnit
- PricingType
- DefaultPricePerUnit
- EstimatedCostPerUnit
- IsActive

## PackagePreset

- Id
- ProductId
- Name
- Weight
- PricePerUnit
- FixedPrice
- SortOrder
- IsActive

## Package

- Id
- ProductId
- PackagePresetId
- Code
- ActualWeight
- PricePerUnit
- SellingPrice
- EstimatedCost
- Status
- CreatedAt
- CreatedBy

## StockInSession

- Id
- CreatedAt
- CreatedBy
- Note

## PackageStockIn

- StockInSessionId
- PackageId

## Order

- Id
- CreatedAt
- CreatedBy
- TotalAmount
- PaymentStatus

## OrderItem

- Id
- OrderId
- PackageId
- ProductId
- ProductNameSnapshot
- Weight
- UnitPrice
- SellingPrice

## Payment

- Id
- OrderId
- Method
- Amount
- CreatedAt

## InventoryTransaction

- Id
- PackageId
- Type
- Reason
- CreatedAt
- CreatedBy

---

# 35. Vì sao OrderItem vẫn lưu Product

OrderItem không nên chỉ tham chiếu Package.

Khi bán nên lưu snapshot:

- Tên sản phẩm lúc bán
- Khối lượng
- Giá/kg
- Giá bán

Ví dụ sau này Admin đổi:

Cá hồi Na Uy

thành:

Cá hồi

thì hóa đơn cũ vẫn giữ nguyên dữ liệu lịch sử tại thời điểm bán.

---

# 36. MVP

MVP gồm:

1. Authentication
2. Category
3. Product
4. Package Preset
5. Package
6. Thêm hàng vào kho
7. Inventory
8. POS
9. Cart
10. Order
11. Payment
12. Điều chỉnh kho
13. Inventory History
14. Basic Reporting

---

# 37. Không cần trong MVP

- Purchase Order
- Supplier
- Purchase Item
- Microservices
- AI
- Multi Branch
- Mobile App native
- Online Store
- Loyalty
- Delivery
- Accounting đầy đủ
- Cân điện tử
- Hóa đơn điện tử

---

# 38. Kiến trúc

Ưu tiên Modular Monolith.

SeafoodPOS

Identity

Catalog

- Category
- Product
- PackagePreset

Inventory

- Package
- StockIn
- InventoryTransaction

Sales

- Cart
- Order
- OrderItem

Payment

Reporting

Không cần Microservices.

---

# 39. Stack

Frontend:

Next.js

Backend:

ASP.NET Core Web API

Database:

PostgreSQL

Deployment:

Docker

Redis chưa cần trong giai đoạn đầu.

---

# 40. Thiết bị mục tiêu

Ưu tiên:

- Tablet
- Desktop
- Laptop
- POS touchscreen

POS phải được thiết kế theo tư duy touch-first.

---

# 41. Business Flow tổng thể

Quản lý tạo:

Category

↓

Product

↓

Preset

Sau đó hằng ngày:

Gia đình làm / đóng gói hàng

↓

Thêm hàng

↓

Tạo Package

↓

IN_STOCK

↓

Khách mua

↓

POS

↓

Order

↓

Payment

↓

Package = SOLD

↓

Dashboard / Report

---

# 42. Nguyên tắc thiết kế

Seafood POS phải:

- Hỗ trợ rất nhiều loại sản phẩm.
- Không hard-code loại hải sản.
- Cho phép tạo Category và Product mới.
- Mỗi Product có Preset riêng.
- Package thực tế có thể khác Preset.
- Quản lý từng hộp riêng.
- Theo dõi cả số hộp và kg.
- Hỗ trợ giá theo kg và giá cố định.
- Không yêu cầu Purchase/Supplier.
- Hỗ trợ tự tạo thành phẩm vào kho.
- Hạn chế tối đa nhập tay.
- Phù hợp người lớn tuổi.
- Lưu lịch sử thay đổi kho.

---

# 43. Product Principle

Nguyên tắc trung tâm:

"Phần mềm phải giống cách gia đình đang bán hàng ngoài đời."

Đối với ba mẹ:

Hệ thống chỉ nên giống một máy bán hàng đơn giản:

Chọn hàngs

→ Chọn hộp

→ Tính tiền

Đối với người quản lý:

Hệ thống vẫn lưu đủ dữ liệu về:

- Sản phẩm
- Hộp
- Khối lượng
- Giá
- Lịch sử
- Tồn kho
- Doanh thu

mà không làm giao diện bán hàng trở nên phức tạp.