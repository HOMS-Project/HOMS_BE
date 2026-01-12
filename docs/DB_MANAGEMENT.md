# 🗄️ Database Management

## 3 Cách để Clear DB & Seed Data

### Method 1: Dùng npm scripts (RECOMMENDED ⭐)

```bash
# Clear database
npm run db:clear

# Seed data
npm run db:seed

# Clear + Seed (reset hoàn toàn)
npm run db:reset
```

### Method 2: Dùng node scripts trực tiếp

```bash
# Clear database
node src/db.js clear

# Seed data
node src/db.js seed

# Reset hoàn toàn
node src/db.js reset
```

### Method 3: MongoDB Compass GUI (Manual)

1. Mở **MongoDB Compass**
2. Connect: `mongodb://localhost:27017`
3. Right-click collection → **Drop Collection** (xóa)
4. Hoặc drop cả database

---

## 📋 Chi Tiết Mỗi Command

### `npm run db:clear`
- ✅ Xóa tất cả documents trong 15 collections
- ✅ Không xóa collections (structure vẫn giữ)
- ⏱️ Nhanh, không tạo data mới

**Collections được clear:**
- users, vehicles, pricelists, routes
- requesttickets, invoices, messages, incidents
- notifications, transactions, maintenanceschedules
- promotions, serviceratings, orders

### `npm run db:seed`
- ✅ Tạo sample data mẫu
- ✅ Cần database sạch (chạy `db:clear` trước)
- 📊 Tạo 18 documents mẫu

**Data được tạo:**
- 4 Users (2 khách, 1 driver, 1 dispatcher)
- 2 Vehicles
- 1 PriceList
- 3 Routes
- 2 RequestTickets
- 2 Invoices

### `npm run db:reset` ⭐ (RECOMMENDED)
- ✅ 1 command xóa + tạo hết
- ✅ Reset database về state mới
- ⏱️ Mất ~10 giây

**Nên dùng lần đầu hoặc muốn reset hoàn toàn**

---

## 🚀 Quick Start

### Lần đầu tiên (setup mới)
```bash
npm install              # Install dependencies
npm run db:reset         # Clear + Seed data
npm run dev              # Start server
```

### Muốn xóa & làm lại
```bash
npm run db:reset         # 1 command = clear + seed
npm run dev              # Start server
```

### Chỉ xóa data (keep structure)
```bash
npm run db:clear
```

### Chỉ thêm data (không xóa cũ)
```bash
npm run db:seed
```

---

## 📊 Kiểm Tra Kết Quả

### Sau khi chạy `npm run db:reset`
```
📡 Connecting to MongoDB...
✅ Connected to MongoDB

🧹 Clearing database...
✅ Database cleared successfully!

🌱 Seeding database...
[Tạo users, vehicles, routes, etc...]

✅ Seeding completed successfully!

✅ Database connection closed
```

### Xem dữ liệu
```bash
# MongoDB Compass
# Connect → Select homs_db → Xem collections

# Hoặc dùng MongoDB CLI
mongosh
use homs_db
db.invoices.find().pretty()
```

---

## ⚠️ Troubleshooting

### Error: `MongoDBError: connect ECONNREFUSED`
```bash
# MongoDB không chạy
mongod  # Start MongoDB locally

# Hoặc sử dụng MongoDB Atlas (cloud)
# Cập nhật .env: MONGODB_URI=mongodb+srv://...
```

### Error: `Cannot find module`
```bash
npm install
```

### Error: Port already in use
```bash
npm run db:clear  # Chỉ clear, không start server
# Hoặc kill process đang dùng port
```

### Muốn xóa cứng (drop cả DB)
```bash
# Dùng MongoDB Compass
# Database → Right-click → Drop Database

# Hoặc MongoDB CLI
mongosh
use homs_db
db.dropDatabase()
```

---

## 📝 Notes

- **Safe**: `db:clear` & `db:seed` không ảnh hưởng database schema
- **Fast**: `db:reset` ~10 giây
- **Repeatable**: Chạy nhiều lần mà không có vấn đề
- **Dev-friendly**: `.env` chứa MONGODB_URI settings

---

## 🔄 Full Workflow

```bash
# 1. Setup lần đầu
npm install
npm run db:reset          # ← Clear + Seed

# 2. Chạy server
npm run dev               # http://localhost:3000

# 3. Test APIs
curl http://localhost:3000/   # GET /

# 4. Muốn reset lại
npm run db:reset          # 1 command = xong

# 5. Hoặc clear + seed riêng
npm run db:clear
npm run db:seed
```

---

## 📚 Files tham khảo

- [src/db.js](../src/db.js) - Database management script
- [src/seeds/index.js](../src/seeds/index.js) - Main seeding logic
- [docs/SEEDING_GUIDE.md](../docs/SEEDING_GUIDE.md) - Hướng dẫn chi tiết
- [SEED_QUICK_START.md](../SEED_QUICK_START.md) - Quick reference
