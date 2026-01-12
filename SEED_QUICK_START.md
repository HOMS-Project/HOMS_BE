# 🚀 QUICK START - Seed Data cho MongoDB

## 1️⃣ Chạy Seed Data (1 dòng lệnh)

```bash
node src/seeds/index.js
```

**Kết quả**: Tạo 18 documents trong 6 collections

## 2️⃣ Xem Dữ Liệu

### Option A: MongoDB Compass (GUI)
- Download: https://www.mongodb.com/products/compass
- Connect: `mongodb://localhost:27017`
- Xem collections: users, vehicles, pricelists, routes, requesttickets, invoices

### Option B: MongoDB CLI
```bash
mongosh
use homs_db
db.invoices.find().pretty()
db.requesttickets.find().pretty()
```

## 3️⃣ Data Được Tạo

### Collections
| Collection | Quantity | Description |
|-----------|----------|-------------|
| users | 4 | 2 khách, 1 driver, 1 dispatcher |
| vehicles | 2 | 1x 2T, 1x 1T |
| pricelists | 1 | Bảng giá 2026 |
| routes | 3 | Q1→Q3, Q7→Q1, Q2→Q9 |
| requesttickets | 2 | FULL_HOUSE, SPECIFIC_ITEMS |
| invoices | 2 | Hợp đồng từ 2 ticket |

### Sample Data

**Invoice 1:**
- Code: INV_2026_001
- Type: FULL_HOUSE (trọn gói)
- Total: 4,235,000 VND
- Vehicle: 1x 2T
- Staff: 3 người
- Services: Packing + Assembling

**Invoice 2:**
- Code: INV_2026_002
- Type: SPECIFIC_ITEMS (items cụ thể)
- Total: 1,911,000 VND (đã giảm khuyến mãi 300K)
- Vehicle: 1x 1T
- Staff: 2 người
- Services: Packing + Insurance

## 4️⃣ Schema & Diagram

📄 File | Nội dung
--------|--------
[SEED_DATA_SUMMARY.md](./SEED_DATA_SUMMARY.md) | Tóm tắt seed data
[MONGODB_SCHEMA_DIAGRAM.md](./MONGODB_SCHEMA_DIAGRAM.md) | Full schema, ER diagram, relationships
[SEEDING_GUIDE.md](./SEEDING_GUIDE.md) | Hướng dẫn chi tiết, troubleshooting
[RESOURCE_PLANNING_LOGIC.md](./RESOURCE_PLANNING_LOGIC.md) | Logic phân bổ xe & nhân công

## 5️⃣ File Seed Data

📂 File | Nội dung
--------|--------
src/seeds/index.js | **Chạy cái này** - main script import tất cả
src/seeds/priceListData.js | Bảng giá (500K-2M VND)
src/seeds/routeData.js | 3 tuyến đường trong TP.HCM
src/seeds/requestTicketData.js | 2 ticket mẫu
src/seeds/invoiceData.js | 2 invoice mẫu

## 6️⃣ Data Relationships

```
USER (Customer)
    ↓
RequestTicket ──→ survey.dispatcherId → USER (Dispatcher)
    ↓
[Khách chấp nhận]
    ↓
Invoice
    ├─ customerId → USER
    ├─ dispatcherId → USER
    ├─ routeId → ROUTE (khung giờ, tuyến đường)
    ├─ pricing.priceListId → PRICELIST (giá)
    └─ assignment.vehicles[]
        ├─ vehicleId → VEHICLE
        ├─ driverIds → USER (Drivers)
        └─ staffIds → USER (Staff)
```

## 7️⃣ Các Trường Quan Trọng

### Invoice Pricing
```javascript
{
  basePrice: 2,000,000,           // Cơ bản theo loại chuyển nhà
  servicesFee: {                  // Dịch vụ
    packing: 300,000,
    assembling: 500,000
  },
  staffFee: {                     // Nhân công
    count: 3,
    totalStaffFee: 450,000
  },
  vehicleFee: {                   // Xe
    vehicleType: "2T",
    totalVehicleFee: 600,000
  },
  surcharge: 0,                   // Phụ phí tuyến đường
  discountAmount: 0,              // Khuyến mãi
  totalPrice: 4,235,000           // Tổng cộng
}
```

### Invoice Resource Planning
```javascript
{
  estimatedPickupTime: 60,        // Lấy hàng (phút)
  estimatedDeliveryTime: 30,      // Giao hàng (phút)
  travelTime: 15,                 // Vận chuyển (phút)
  totalTimeRequired: 105,         // Tổng cộng
  timeAvailable: 240,             // Thời gian có sẵn (deadline)
  vehiclesNeeded: 1,              // Số xe cần
  strategyUsed: "SINGLE_VEHICLE", // SINGLE_VEHICLE / PARALLEL_PICKUP_DELIVERY
  notes: "Thời gian thoáng, 1 xe đủ"
}
```

## 8️⃣ Workflow

```
1. Customer tạo RequestTicket
   ├─ FULL_HOUSE (trọn gói) hoặc SPECIFIC_ITEMS
   └─ OFFLINE (khảo sát tại nhà) hoặc ONLINE (video call)

2. Dispatcher khảo sát & báo giá
   └─ status: PRICE_QUOTED

3. Customer chấp nhận
   └─ status: CUSTOMER_ACCEPTED

4. Dispatcher tạo Invoice (Hợp đồng)
   ├─ Tính resourcePlanning (số xe, nhân công)
   ├─ Từ PriceList tính giá
   └─ status: PENDING

5. Dispatcher xác nhận & phân công
   ├─ Chọn xe từ VEHICLE
   ├─ Chọn driver & staff từ USER
   └─ status: ASSIGNED

6. Thực hiện & Tracking
   ├─ Pickup → InTransit → Delivery
   └─ status: COMPLETED
```

## 9️⃣ Các Tính Năng Đã Implement

✅ **RequestTicket**
- Type: FULL_HOUSE (trọn gói) / SPECIFIC_ITEMS (cụ thể)
- Survey Type: OFFLINE (tại nhà) / ONLINE (video call)
- Timeline tracking

✅ **Invoice** (Hợp đồng)
- Liên kết với RequestTicket
- Multiple vehicles (1 invoice có thể điều > 1 xe)
- Services linh hoạt (toàn bộ hoặc từng item)
- Photos per item (chỉ những item cần kiểm tra kĩ)
- Resource planning (tính số xe & nhân công tự động)
- Pricing detail (cơ bản + dịch vụ + nhân công + xe)

✅ **Route** (Tuyến đường)
- Khung giờ cho phép (tránh vi phạm luật GT)
- Peak hours (giờ cao điểm)
- Surcharge/discount cho các tuyến đặc biệt

✅ **PriceList**
- Giá cơ bản theo loại chuyển nhà
- Giá theo khoảng cách, trọng lượng, thể tích
- Dịch vụ (đóng gói, tháo lắp, bảo hiểm)
- Giá nhân công & xe
- Sample items (tham khảo & tính giá tự động)

## 🔟 Troubleshooting

### MongoDB không kết nối
```bash
# Start MongoDB
mongod

# Hoặc dùng MongoDB Atlas (cloud)
# Cập nhật .env: MONGODB_URI=mongodb+srv://...
```

### Lỗi module not found
```bash
npm install
```

### Xóa dữ liệu cũ
```javascript
// MongoDB CLI
use homs_db
db.invoices.deleteMany({})
db.requesttickets.deleteMany({})
// ... etc
```

---

**Ready?** Chạy `node src/seeds/index.js` ngay! 🚀
