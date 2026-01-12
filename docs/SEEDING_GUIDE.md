# How to Seed MongoDB with Sample Data

## Quick Start

### 1. Chuẩn bị
```bash
# Đảm bảo bạn có Node.js và MongoDB đang chạy
# Tạo file .env với MONGODB_URI (nếu chưa có)

MONGODB_URI=mongodb://localhost:27017/homs_db
PORT=3000
```

### 2. Chạy Seeding Script

#### Option A: Chạy seed script trực tiếp
```bash
# Từ thư mục BE (root project)
node src/seeds/index.js
```

#### Option B: Thêm vào package.json
```json
{
  "scripts": {
    "seed": "node src/seeds/index.js",
    "seed:clear": "node src/seeds/index.js --clear"
  }
}
```

Rồi chạy:
```bash
npm run seed
```

### 3. Kiểm tra kết quả

Sau khi chạy thành công, bạn sẽ thấy:
```
🌱 Starting database seeding...
✅ Connected to MongoDB
🧹 Clearing existing collections...
✅ Collections cleared

👥 Creating users...
✅ Created 4 users

🚗 Creating vehicles...
✅ Created 2 vehicles

💰 Creating price list...
✅ Created 1 price list(s)

🗺️ Creating routes...
✅ Created 3 route(s)

📝 Creating request tickets...
✅ Created 2 request ticket(s)

📄 Creating invoices...
✅ Created 2 invoice(s)

📊 ═══════════════════════════════════════
    SEEDING COMPLETE - SUMMARY
═══════════════════════════════════════
Users:          4
Vehicles:       2
Price Lists:    1
Routes:         3
Tickets:        2
Invoices:       2
═══════════════════════════════════════
```

## Sample Data được tạo

### Users
1. **Nguyễn Văn A** - Customer
   - Email: customerA@example.com
   - Phone: 0912345678

2. **Trần Thị B** - Customer
   - Email: customerB@example.com
   - Phone: 0987654321

3. **Lê Văn C** - Driver
   - Email: driverC@example.com
   - License: DL123456

4. **Phạm Văn D** - Dispatcher
   - Email: dispatching@example.com

### Vehicles
1. **VH_2T_001** - Xe tải 2T (Huyndai)
   - Capacity: 2T
   - License: 51A-00001

2. **VH_1T_001** - Xe tải 1T (Kia)
   - Capacity: 1T
   - License: 51A-00002

### Routes
1. **ROUTE_Q1_TO_Q3** - Quận 1 → Quận 3
   - Distance: 3 km
   - Duration: 15 phút

2. **ROUTE_Q7_TO_Q1** - Quận 7 → Quận 1
   - Distance: 8 km
   - Duration: 30 phút
   - Surcharge: 100K

3. **ROUTE_Q2_TO_Q9** - Quận 2 → Quận 9
   - Distance: 12 km
   - Duration: 45 phút
   - Surcharge: 150K

### Price List
**PRICELIST_DEFAULT_2026**
- Base price (Full House): 2,000,000 VND
- Base price (Specific Items): 500,000 VND
- Packing service: 300,000 VND
- Assembling service: 500,000 VND
- Insurance service: 200,000 VND
- Photography service: 100,000 VND

### Request Tickets
1. **TICKET_2026_001** - Chuyển nhà trọn gói (FULL_HOUSE)
   - Customer: Nguyễn Văn A
   - Survey Type: OFFLINE
   - Status: PRICE_QUOTED
   - Estimated Price: 3,500,000 VND

2. **TICKET_2026_002** - Chuyển items cụ thể (SPECIFIC_ITEMS)
   - Customer: Trần Thị B
   - Survey Type: ONLINE
   - Status: CUSTOMER_ACCEPTED
   - Items: Sofa, Tủ lạnh, Bàn ăn

### Invoices
1. **INV_2026_001** - Chuyển nhà trọn gói
   - From: 123 Nguyễn Huệ, Q1
   - To: 456 Tân Định, Q3
   - Total Price: 4,235,000 VND
   - Status: CONFIRMED
   - Vehicles: 1 xe 2T
   - Staff: 3 người

2. **INV_2026_002** - Chuyển items Q7→Q1
   - From: 789 Võ Văn Ngân, Thủ Đức
   - To: 321 Lê Lợi, Q1
   - Total Price: 1,911,000 VND (sau khuyến mãi 300K)
   - Status: ASSIGNED
   - Vehicles: 1 xe 1T
   - Staff: 2 người

## MongoDB Compass - Visualize Data

### 1. Mở MongoDB Compass
- Download: https://www.mongodb.com/products/compass
- Connect: `mongodb://localhost:27017`

### 2. Xem các collections
```
homs_db
├── users (4 documents)
├── vehicles (2 documents)
├── pricelists (1 document)
├── routes (3 documents)
├── requesttickets (2 documents)
└── invoices (2 documents)
```

### 3. Xem relationships
- Click vào một Invoice document
- Expand `requestTicketId` → xem liên kết tới RequestTicket
- Expand `customerId` → xem liên kết tới User
- Expand `assignment.vehicles[].vehicleId` → xem Vehicle

## Data Format Output (JSON)

### Sample Request Ticket
```json
{
  "_id": ObjectId,
  "code": "TICKET_2026_001",
  "customerId": ObjectId,
  "type": "FULL_HOUSE",
  "surveyType": "OFFLINE",
  "pickupAddress": {
    "address": "123 Nguyễn Huệ, Q1, TP.HCM",
    "coordinates": { "lat": 10.7725, "lng": 106.6992 }
  },
  "deliveryAddress": {
    "address": "456 Tân Định, Q3, TP.HCM",
    "coordinates": { "lat": 10.7869, "lng": 106.6780 }
  },
  "status": "PRICE_QUOTED",
  "survey": {
    "estimatedPrice": 3500000,
    "estimatedWeight": 800,
    "staffCount": 3
  }
}
```

### Sample Invoice
```json
{
  "_id": ObjectId,
  "code": "INV_2026_001",
  "requestTicketId": ObjectId,
  "customerId": ObjectId,
  "moveType": "FULL_HOUSE",
  "status": "CONFIRMED",
  "pricing": {
    "basePrice": 2000000,
    "servicesFee": {
      "packing": 300000,
      "assembling": 500000
    },
    "staffFee": {
      "count": 3,
      "totalStaffFee": 450000
    },
    "totalPrice": 4235000
  },
  "assignment": {
    "vehicles": [
      {
        "vehicleId": ObjectId,
        "driverIds": [ObjectId],
        "staffIds": [ObjectId, ObjectId, ObjectId]
      }
    ]
  }
}
```

## Troubleshooting

### Lỗi: `MongoDBError: connect ECONNREFUSED`
- Kiểm tra MongoDB có chạy không
- Chạy: `mongod` hoặc dùng MongoDB Atlas (cloud)
- Cập nhật MONGODB_URI trong .env

### Lỗi: `MONGODB_URI is not defined`
- Tạo file `.env` trong thư mục BE
- Thêm: `MONGODB_URI=mongodb://localhost:27017/homs_db`

### Lỗi: `Cannot find module`
- Chạy: `npm install`
- Đảm bảo chạy từ thư mục BE

### Xóa dữ liệu cũ
```bash
# Xóa một collection
db.getCollection('invoices').deleteMany({})

# Xóa tất cả collections (hãy cẩn thận!)
npm run seed
```

## Next Steps

1. **Xem dữ liệu trong MongoDB Compass**
   - Visualize relationships giữa collections
   - Kiểm tra structure của documents

2. **Tạo API endpoints**
   - GET /api/invoices
   - GET /api/invoices/:id
   - POST /api/invoices

3. **Test resource planning logic**
   ```bash
   node src/examples/ResourcePlanningExamples.js
   ```

4. **Export data cho diagram**
   - Dùng MongoDB Compass export ra JSON/CSV
   - Dùng tools như Lucidchart, DbVisualizer để vẽ diagram

## References
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Schema Design Pattern](https://www.mongodb.com/blog/post/schema-design-patterns)
- Xem file: [MONGODB_SCHEMA_DIAGRAM.md](./MONGODB_SCHEMA_DIAGRAM.md)
