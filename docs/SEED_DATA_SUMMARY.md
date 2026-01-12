# 📊 SEED DATA - TÓMLƯỢC

Tất cả các file seed data đã tạo xong. Cấu trúc dữ liệu mẫu phù hợp để import vào MongoDB và tạo diagram.

## 📂 File Structure

```
src/seeds/
├── index.js                 ← Main seed script (chạy cái này)
├── priceListData.js         ← Bảng giá
├── routeData.js            ← Tuyến đường
├── requestTicketData.js    ← Yêu cầu khách hàng
└── invoiceData.js          ← Hợp đồng

docs/
├── MONGODB_SCHEMA_DIAGRAM.md   ← Full schema diagram
├── SEEDING_GUIDE.md            ← Hướng dẫn chạy
└── RESOURCE_PLANNING_LOGIC.md  ← Logic phân bổ tài nguyên
```

## 🚀 Chạy Seed Data

### 1. Chạy script
```bash
node src/seeds/index.js
```

### 2. Kết quả
```
Users:      4 (2 Customer, 1 Driver, 1 Dispatcher)
Vehicles:   2 (1x 2T, 1x 1T)
PriceList:  1 (Bảng giá 2026)
Routes:     3 (Q1→Q3, Q7→Q1, Q2→Q9)
Tickets:    2 (FULL_HOUSE, SPECIFIC_ITEMS)
Invoices:   2 (Invoice từ 2 ticket)
```

## 📋 Dữ Liệu Mẫu

### 1. PriceList (Bảng giá)
```javascript
{
  code: "PRICELIST_DEFAULT_2026",
  basePrice: {
    fullHouse: 2,000,000,    // Trọn gói
    specificItems: 500,000   // Items cụ thể
  },
  services: {
    packing: 300,000,        // Đóng gói
    assembling: 500,000,     // Tháo lắp
    insurance: 200,000,      // Bảo hiểm
    photography: 100,000     // Chụp ảnh
  },
  sampleItems: [
    { name: "Sofa 3 chỗ", weight: 80, basePrice: 500,000 },
    { name: "Tủ lạnh 2 cánh", weight: 100, basePrice: 300,000 },
    { name: "Tủ quần áo 4 cánh", weight: 120, basePrice: 600,000 },
    // ... thêm các items mẫu khác
  ]
}
```

### 2. Route (Tuyến đường)
```javascript
[
  {
    code: "ROUTE_Q1_TO_Q3",
    distance: 3,
    estimatedDuration: 15,
    allowedTimeSlots: [
      { dayOfWeek: "All", startTime: "06:00", endTime: "22:00" }
    ],
    peakHours: [
      { dayOfWeek: "Weekday", startHour: 7, endHour: 9 },  // 7-9h
      { dayOfWeek: "Weekday", startHour: 17, endHour: 19 } // 5-7p
    ]
  },
  // Route Q7→Q1, Route Q2→Q9
]
```

### 3. RequestTicket (Yêu cầu khách)
```javascript
[
  {
    code: "TICKET_2026_001",
    type: "FULL_HOUSE",        // Trọn gói
    surveyType: "OFFLINE",     // Khảo sát tại nhà
    status: "PRICE_QUOTED",    // Đã báo giá
    roomInfo: { width: 5, length: 6, height: 3 }
  },
  {
    code: "TICKET_2026_002",
    type: "SPECIFIC_ITEMS",    // Items cụ thể
    surveyType: "ONLINE",      // Khảo sát online
    status: "CUSTOMER_ACCEPTED", // Khách đã đồng ý
    items: [
      { name: "Sofa 3 chỗ", weight: 80 },
      { name: "Tủ lạnh 2 cánh", weight: 100 },
      { name: "Bàn ăn gỗ", weight: 60 }
    ]
  }
]
```

### 4. Invoice (Hợp đồng)
```javascript
[
  {
    code: "INV_2026_001",
    moveType: "FULL_HOUSE",
    status: "CONFIRMED",
    pricing: {
      basePrice: 2,000,000,
      servicesFee: { packing: 300,000, assembling: 500,000 },
      staffFee: { count: 3, totalStaffFee: 450,000 },
      vehicleFee: { vehicleType: "2T", totalVehicleFee: 600,000 },
      totalPrice: 4,235,000  // VND
    },
    resourcePlanning: {
      vehiclesNeeded: 1,
      strategyUsed: "SINGLE_VEHICLE",
      notes: "Thời gian thoáng, 1 xe đủ"
    },
    assignment: {
      vehicles: [
        {
          vehicleId: ObjectId,
          driverIds: [ObjectId],
          staffIds: [ObjectId, ObjectId, ObjectId]  // 3 người
        }
      ]
    }
  },
  {
    code: "INV_2026_002",
    moveType: "SPECIFIC_ITEMS",
    status: "ASSIGNED",
    pricing: {
      basePrice: 500,000,
      servicesFee: { packing: 300,000, insurance: 200,000 },
      discountAmount: 300,000,  // Khuyến mãi
      totalPrice: 1,911,000
    }
  }
]
```

## 🔗 Data Relationships

```
RequestTicket → customerId → USER (Customer)
                           ↓
                    survey.dispatcherId → USER (Dispatcher)
                           ↓
                         [Khách chấp nhận]
                           ↓
Invoice ← requestTicketId ← RequestTicket
    ├─ customerId → USER (Customer)
    ├─ dispatcherId → USER (Dispatcher)
    ├─ routeId → ROUTE
    ├─ pricing.priceListId → PRICELIST
    └─ assignment.vehicles[]
        ├─ vehicleId → VEHICLE
        ├─ driverIds → USER (Drivers)
        └─ staffIds → USER (Staff)
```

## 📊 MongoDB Compass Visualization

Sau khi seed data, mở MongoDB Compass để:
1. **Xem các collections**: users, vehicles, pricelists, routes, requesttickets, invoices
2. **Xem relationships**: Click vào document để expand references
3. **Xem sample data**: Kiểm tra structure của mỗi collection
4. **Export diagram**: Dùng công cụ khác để vẽ ER diagram

## 🎯 Ví dụ Use Case

### TH1: Khách muốn chuyển nhà FULL HOUSE
1. Khách tạo RequestTicket (type=FULL_HOUSE)
2. Dispatcher khảo sát offline tại nhà
3. Báo giá 3,5 triệu VND
4. Khách chấp nhận
5. Dispatcher tạo Invoice với:
   - 1 xe 2T
   - 3 người
   - Dịch vụ: Đóng gói + Tháo lắp
   - Total: 4,235,000 VND

### TH2: Khách chuyển SPECIFIC ITEMS
1. Khách tạo RequestTicket (type=SPECIFIC_ITEMS)
   - Sofa, Tủ lạnh, Bàn ăn
2. Dispatcher khảo sát online (video call)
3. Báo giá 1,2 triệu VND
4. Khách chấp nhận + áp dụng mã khuyến mãi
5. Dispatcher tạo Invoice với:
   - 1 xe 1T
   - 2 người
   - Dịch vụ: Đóng gói + Bảo hiểm tủ lạnh
   - Total: 1,911,000 VND (sau khuyến mãi)

## ✅ Khi nào dùng được

- ✓ Import vào MongoDB thực
- ✓ Tạo diagram trong MongoDB Compass
- ✓ Test API endpoints
- ✓ Kiểm tra data relationships
- ✓ Demo cho client/team

## 📝 Note

- Tất cả ObjectId được tạo tự động
- Giá tiền mẫu cho TP.HCM (có thể điều chỉnh)
- Sample items có đầy đủ mô tả & ảnh URLs
- Timeline hoàn chỉnh cho mỗi ticket/invoice
- Resource planning được tính sẵn cho mỗi invoice

## 🔗 Files liên quan
- [SEEDING_GUIDE.md](./SEEDING_GUIDE.md) - Hướng dẫn chi tiết
- [MONGODB_SCHEMA_DIAGRAM.md](./MONGODB_SCHEMA_DIAGRAM.md) - Full schema diagram
- [RESOURCE_PLANNING_LOGIC.md](./RESOURCE_PLANNING_LOGIC.md) - Logic xe & nhân công
