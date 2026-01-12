# Resource Planning Logic - Phân bổ Tài nguyên & Nhân lực

## Bài toán
Chuyển nhà từ A đến B, cần phân bổ số xe và nhân công sao cho phù hợp với ràng buộc thời gian.

```
Pickup A (30') → Travel (60') → Delivery B (30') = Total 120' (2 giờ)
```

## 3 Trường hợp

### TH1: Deadline Hạn chế (11:00 → 13:00 = 2 giờ) → Cần 2 xe
```
Time available: 120 phút
Time required: 30 + 60 + 30 = 120 phút
Status: TIGHT - không có buffer

SOLUTION: Dùng 2 xe song song (PARALLEL_PICKUP_DELIVERY)
┌─────────────────────────────────────────────────────┐
│ Xe 1: Pickup A + Travel                              │
│ ├─ 11:00-11:30: Pickup (30')                         │
│ ├─ 11:30-12:30: Travel A→B (60')                     │
│ └─ 12:30: Tới nơi giao                               │
│                                                       │
│ Xe 2: Waiting + Delivery B                           │
│ ├─ 12:30-13:00: Delivery (30')                       │
│ └─ 13:00: Hoàn thành ✓                               │
└─────────────────────────────────────────────────────┘

Tổng thời gian: ~90-100 phút (thay vì 120 phút)
```

### TH2: Deadline Thoáng (11:00 → 15:00 = 4 giờ) → Cần 1 xe
```
Time available: 240 phút
Time required: 120 phút
Status: COMFORTABLE - có buffer 120 phút

SOLUTION: Dùng 1 xe (SINGLE_VEHICLE)
┌─────────────────────────────────────────────────────┐
│ Xe 1: Pickup → Travel → Delivery                     │
│ ├─ 11:00-11:30: Pickup A (30')                       │
│ ├─ 11:30-12:30: Travel A→B (60')                     │
│ ├─ 12:30-13:00: Delivery B (30')                     │
│ └─ 13:00: Hoàn thành ✓ (còn 2 giờ buffer)            │
└─────────────────────────────────────────────────────┘

Tổng thời gian: 120 phút
```

### TH3: Deadline Cực hạn (11:00 → 12:00 = 1 giờ) → Cần 3 xe (RELAY)
```
Time available: 60 phút
Time required: 120 phút
Status: IMPOSSIBLE with standard approach

SOLUTION: Dùng 3 xe relay (STAGGERED) - không khuyến khích
┌──────────────────────────────────────────────────────┐
│ Xe 1: Pickup + Partial Travel (tới điểm trung gian)  │
│ ├─ 11:00-11:30: Pickup (30')                         │
│ ├─ 11:30-11:45: Travel tới điểm transfer (15')       │
│                                                       │
│ Xe 2: Relay Transport (transfer)                      │
│ ├─ 11:45-12:00: Transport (15')                       │
│                                                       │
│ Xe 3: Final Delivery                                  │
│ ├─ 12:00: Chưa kịp giao ✗                            │
└──────────────────────────────────────────────────────┘

⚠️ KHUYẾN NGHỊ: Xin khách hàng kéo dài deadline hoặc chia 2 lần chuyển
```

## Logic Quyết định

```javascript
const timeAvailable = deadline - currentTime
const totalTimeRequired = pickupTime + travelTime + deliveryTime
const bufferRatio = totalTimeRequired * 1.1 // 10% buffer

IF timeAvailable >= bufferRatio
  → SINGLE_VEHICLE ✓ (đủ thời gian)

ELSE IF timeAvailable >= (travelTime + max(pickupTime, deliveryTime) * 1.1)
  → PARALLEL_PICKUP_DELIVERY (2 xe) - pickup/travel song song với delivery
  → Giảm thời gian: ~(travelTime + max(pickupTime, deliveryTime)) thay vì (pickupTime + travelTime + deliveryTime)

ELSE
  → STAGGERED (3+ xe) - không khuyến khích
  → ⚠️ Cần xác nhận với khách hàng
```

## Input Parameters

### 1. calculateResourceNeeds()
```javascript
{
  currentTime: Date,           // Thời điểm hiện tại
  deliveryDeadline: Date,      // Deadline giao hàng (yêu cầu khách)
  estimatedPickupTime: 30,     // Thời gian lấy hàng (phút) - default 30
  travelTime: 60,              // Thời gian vận chuyển (phút)
  estimatedDeliveryTime: 30    // Thời gian giao hàng (phút) - default 30
}
```

### 2. calculateStaffNeeds()
```javascript
{
  totalWeight: 800,            // Tổng trọng lượng (kg)
  totalVolume: 5,              // Tổng thể tích (m³)
  vehiclesNeeded: 2,           // Số xe từ calculateResourceNeeds
  hasService: true             // Có dịch vụ đóng gói/tháo lắp
}
```

## Output

```javascript
{
  vehiclesNeeded: 2,
  strategyUsed: "PARALLEL_PICKUP_DELIVERY",
  timeAnalysis: {
    currentTime: "2026-01-06T11:00:00Z",
    deliveryDeadline: "2026-01-06T13:00:00Z",
    timeAvailable: 120,              // phút
    totalTimeRequired: 120,
    requiredTimeWithBuffer: 132
  },
  notes: "Thời gian hạn chế: 120p < 132p. Cần 2 xe: pickup+travel song song với delivery.",
  feasible: true
}
```

## Integration vào Invoice Model

Khi tạo Invoice, hệ thống tự động:

1. **Tính resourcePlanning** bằng `calculateResourceNeeds()`
2. **Tính staffCount** bằng `calculateStaffNeeds()`
3. **Tạo timeline** bằng `createExecutionTimeline()`
4. **Cập nhật assignment** với số xe/nhân công phù hợp
5. **Điều chỉnh giá** theo số xe (vehicle fee)

## Example Flow

```javascript
// 1. Dispatcher tạo Invoice từ RequestTicket đã accepted
const invoiceData = {
  requestTicketId: ticket._id,
  customerId: customer._id,
  scheduledTime: new Date(),
  deliveryDeadline: new Date(Date.now() + 2 * 3600000), // 2 giờ nữa
  // ... other fields
};

// 2. Hệ thống tính resourcePlanning
const resourcePlanning = ResourcePlanningCalculator.calculateResourceNeeds({
  currentTime: new Date(),
  deliveryDeadline: invoiceData.deliveryDeadline,
  travelTime: 60 // từ Route
});

invoiceData.resourcePlanning = resourcePlanning;

// 3. Tính nhân công
const staffNeeds = ResourcePlanningCalculator.calculateStaffNeeds({
  totalWeight: invoice.pricing.totalWeight,
  totalVolume: invoice.pricing.totalVolume,
  vehiclesNeeded: resourcePlanning.vehiclesNeeded,
  hasService: invoice.services.packing.isAppliedAll
});

invoiceData.resourcePlanning.staffCount = staffNeeds.staffCount;

// 4. Phân công
invoiceData.assignment.vehicles = [
  { vehicleId: vehicle1._id, driverIds: [...], staffIds: [...] },
  // Nếu vehiclesNeeded === 2
  { vehicleId: vehicle2._id, driverIds: [...], staffIds: [...] }
];

// 5. Lưu Invoice
const invoice = await Invoice.create(invoiceData);
```

## Notes
- Tất cả thời gian đều tính bằng phút
- Buffer 10% để đề phòng delay
- Xe chỉ cần > 1 khi deadline quá hạn chế
- STAGGERED strategy không nên dùng, chỉ là thông báo cho dispatcher/admin
- Có thể custom estimatedPickupTime/DeliveryTime theo loại hàng
