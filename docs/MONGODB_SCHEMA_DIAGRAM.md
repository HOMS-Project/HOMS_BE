# MongoDB Schema Diagram & Data Relationships

## Collections Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         HOMS DATABASE SCHEMA                          │
└──────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │   USER      │
                              └─────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
              (Customer)       (Dispatcher)     (Driver)
                    │               │               │
        ┌───────────┴───────────┐   │               │
        │                       │   │               │
   ┌────────────┐         ┌──────────────┐    ┌─────────┐
   │ RequestTicket   │     │  Invoice    │    │ Vehicle │
   └────────────┘         └──────────────┘    └─────────┘
        │                       │                   │
        │                       ├──→ routeId ──→ Route
        │                       │
        │                       ├──→ priceListId → PriceList
        │                       │
        │                       └──→ promotionId → Promotion
        │
        └──→ customerId → USER
```

## Detailed Collection Schemas

### 1. USER Collection
```json
{
  "_id": ObjectId,
  "fullName": "Nguyễn Văn A",
  "email": "customerA@example.com",
  "phone": "0912345678",
  "password": "hash123",
  "role": "Customer|Dispatcher|Driver|Admin",
  "avatar": "https://example.com/avatar.jpg",
  "status": "Active|Inactive|Blocked",
  "driverProfile": {
    "licenseNumber": "DL123456",
    "skills": ["Bốc xếp", "Lái xe tải"],
    "isAvailable": true
  },
  "createdAt": ISODate,
  "updatedAt": ISODate
}
```

### 2. PRICELIST Collection
```json
{
  "_id": ObjectId,
  "code": "PRICELIST_DEFAULT_2026",
  "name": "Bảng giá mặc định 2026",
  "basePrice": {
    "fullHouse": 2000000,
    "specificItems": 500000
  },
  "distancePricing": [
    { "minDistance": 0, "maxDistance": 5, "pricePerKm": 50000 }
  ],
  "weightPricing": [
    { "minWeight": 0, "maxWeight": 500, "pricePerKg": 5000 }
  ],
  "services": {
    "packing": 300000,
    "assembling": 500000,
    "insurance": 200000,
    "photography": 100000
  },
  "sampleItems": [
    {
      "category": "Furniture",
      "name": "Sofa 3 chỗ",
      "dimensions": { "length": 200, "width": 90, "height": 80 },
      "weight": 80,
      "material": "Vải",
      "basePrice": 500000
    }
  ],
  "isActive": true,
  "createdAt": ISODate
}
```

### 3. ROUTE Collection
```json
{
  "_id": ObjectId,
  "code": "ROUTE_Q1_TO_Q3",
  "name": "Quận 1 → Quận 3",
  "area": "TP.HCM",
  "district": "Q1-Q3",
  "routes": [
    {
      "routeName": "Ben Thanh - Tan Dinh",
      "startPoint": {
        "address": "Bến Thành, Q1",
        "coordinates": { "lat": 10.7725, "lng": 106.6992 }
      },
      "endPoint": {
        "address": "Tân Định, Q3",
        "coordinates": { "lat": 10.7869, "lng": 106.6780 }
      },
      "distance": 3,
      "estimatedDuration": 15,
      "allowedTimeSlots": [
        { "dayOfWeek": "All", "startTime": "06:00", "endTime": "22:00" }
      ],
      "restrictions": [
        { "type": "PEAK_HOURS", "startTime": "07:00", "endTime": "09:00" }
      ],
      "surcharge": 0,
      "discountRate": 0
    }
  ],
  "compatibleVehicles": ["500kg", "1T", "2T"],
  "recommendedStaffCount": 2,
  "isActive": true,
  "createdAt": ISODate
}
```

### 4. REQUESTTICKET Collection
```json
{
  "_id": ObjectId,
  "code": "TICKET_2026_001",
  "customerId": ObjectId,         // Ref: USER
  "type": "FULL_HOUSE|SPECIFIC_ITEMS",
  "surveyType": "OFFLINE|ONLINE",
  "pickupAddress": {
    "address": "123 Nguyễn Huệ, Q1",
    "coordinates": { "lat": 10.7725, "lng": 106.6992 }
  },
  "deliveryAddress": {
    "address": "456 Tân Định, Q3",
    "coordinates": { "lat": 10.7869, "lng": 106.6780 }
  },
  "roomInfo": {
    "width": 5,
    "length": 6,
    "height": 3,
    "totalSquareMeters": 30
  },
  "items": [
    {
      "name": "Sofa 3 chỗ",
      "quantity": 1,
      "dimensions": { "length": 200, "width": 90, "height": 80 },
      "weight": 80,
      "material": "Vải",
      "images": ["url1", "url2"],
      "note": "Mô tả item"
    }
  ],
  "overallPhotos": ["url1", "url2"],
  "survey": {
    "dispatcherId": ObjectId,      // Ref: USER
    "surveyDate": ISODate,
    "notes": "Ghi chú khảo sát",
    "estimatedPrice": 3500000,
    "estimatedWeight": 800,
    "staffCount": 3
  },
  "status": "CREATED|WAITING_SURVEY|SURVEYED|PRICE_QUOTED|CUSTOMER_ACCEPTED|INVOICE_CREATED",
  "contract": {
    "invoiceId": ObjectId           // Ref: INVOICE (khi đã tạo)
  },
  "timeline": {
    "createdAt": ISODate,
    "surveyStartedAt": ISODate,
    "customerAcceptedAt": ISODate
  }
}
```

### 5. INVOICE Collection (Hợp đồng)
```json
{
  "_id": ObjectId,
  "code": "INV_2026_001",
  "requestTicketId": ObjectId,    // Ref: REQUESTTICKET
  "customerId": ObjectId,         // Ref: USER
  "dispatcherId": ObjectId,       // Ref: USER
  "pickup": {
    "address": "123 Nguyễn Huệ, Q1",
    "coordinates": { "lat": 10.7725, "lng": 106.6992 }
  },
  "delivery": {
    "address": "456 Tân Định, Q3",
    "coordinates": { "lat": 10.7869, "lng": 106.6780 }
  },
  "routeId": ObjectId,             // Ref: ROUTE
  "scheduledTime": ISODate,
  "scheduledTimeWindow": {
    "startTime": "08:00",
    "endTime": "12:00"
  },
  "deliveryDeadline": ISODate,
  "moveType": "FULL_HOUSE|SPECIFIC_ITEMS",
  "surveyType": "OFFLINE|ONLINE",
  
  "services": {
    "packing": {
      "isAppliedAll": true,
      "itemIds": []
    },
    "assembling": {
      "isAppliedAll": false,
      "itemIds": [0, 2]              // Index của items cần dịch vụ
    }
  },

  "items": [
    {
      "name": "Sofa 3 chỗ",
      "quantity": 1,
      "dimensions": { "length": 200, "width": 90, "height": 80 },
      "weight": 80,
      "material": "Vải",
      "photos": {
        "before": ["url"],
        "after": ["url"]
      }
    }
  ],

  "resourcePlanning": {
    "estimatedPickupTime": 60,
    "estimatedDeliveryTime": 30,
    "travelTime": 15,
    "totalTimeRequired": 105,
    "timeAvailable": 240,
    "vehiclesNeeded": 1,
    "strategyUsed": "SINGLE_VEHICLE|PARALLEL_PICKUP_DELIVERY|STAGGERED",
    "notes": "Thời gian thoáng, 1 xe đủ"
  },

  "pricing": {
    "priceListId": ObjectId,        // Ref: PRICELIST
    "estimatedDistance": 3,
    "totalWeight": 340,
    "totalVolume": 8,
    "basePrice": 2000000,
    "servicesFee": {
      "packing": 300000,
      "assembling": 500000
    },
    "staffFee": {
      "count": 3,
      "pricePerPerson": 150000,
      "totalStaffFee": 450000
    },
    "vehicleFee": {
      "vehicleType": "2T",
      "pricePerDay": 1200000,
      "totalVehicleFee": 600000
    },
    "discountAmount": 0,
    "subtotal": 3850000,
    "tax": 385000,
    "totalPrice": 4235000
  },

  "status": "DRAFT|PENDING|CONFIRMED|ASSIGNED|IN_PROGRESS|COMPLETED",

  "assignment": {
    "vehicles": [
      {
        "vehicleId": ObjectId,      // Ref: VEHICLE
        "driverIds": [ObjectId],    // Ref: USER (Drivers)
        "staffIds": [ObjectId],     // Ref: USER (Staff)
        "assignedAt": ISODate
      }
    ],
    "assignmentDate": ISODate
  },

  "overallPhotos": {
    "pickupBefore": ["url"],
    "deliveryAfter": ["url"]
  },

  "payment": {
    "method": "COD|Card|Wallet|Bank Transfer",
    "status": "Pending|Paid|Failed|Refunded",
    "paidAt": ISODate,
    "transactionId": "TXN123"
  },

  "timeline": [
    {
      "status": "CONFIRMED",
      "updatedBy": ObjectId,        // Ref: USER
      "updatedAt": ISODate,
      "notes": "Đã xác nhận"
    }
  ],

  "feedback": {
    "rating": 5,
    "driverRating": 5,
    "comment": "Tốt"
  },

  "createdAt": ISODate,
  "updatedAt": ISODate
}
```

### 6. VEHICLE Collection
```json
{
  "_id": ObjectId,
  "code": "VH_2T_001",
  "name": "Xe tải 2T - Huyndai",
  "type": "500kg|1T|2T|3T",
  "licensePlate": "51A-00001",
  "capacity": 2000,
  "status": "Active|Inactive|Maintenance",
  "driverId": ObjectId,             // Ref: USER (Driver)
  "maintenanceSchedule": ObjectId,  // Ref: MAINTENANCESCHEDULE
  "createdAt": ISODate
}
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      CUSTOMER JOURNEY                            │
└─────────────────────────────────────────────────────────────────┘

1️⃣ Customer tạo RequestTicket
   ├─ customerId → USER
   ├─ type: FULL_HOUSE hay SPECIFIC_ITEMS
   ├─ surveyType: OFFLINE hay ONLINE
   └─ status: CREATED

2️⃣ Dispatcher khảo sát & báo giá
   ├─ dispatcherId → USER (Dispatcher)
   ├─ survey: estimatedPrice, staffCount, recommendedVehicles
   └─ status: PRICE_QUOTED

3️⃣ Customer đồng ý
   └─ status: CUSTOMER_ACCEPTED

4️⃣ Dispatcher tạo Invoice (Hợp đồng)
   ├─ requestTicketId → REQUESTTICKET
   ├─ customerId → USER
   ├─ dispatcherId → USER
   ├─ routeId → ROUTE
   ├─ Tính resourcePlanning (số xe, nhân công)
   ├─ Từ PriceList tính pricing
   └─ status: PENDING

5️⃣ Dispatcher xác nhận & phân công
   ├─ assignment.vehicles[].vehicleId → VEHICLE
   ├─ assignment.vehicles[].driverIds → USER (Drivers)
   ├─ assignment.vehicles[].staffIds → USER (Staff)
   └─ status: ASSIGNED

6️⃣ Execution & Tracking
   ├─ Pickup → InTransit → Delivery
   └─ status: COMPLETED

7️⃣ Thanh toán & Feedback
   ├─ payment: Paid
   └─ feedback: Rating
```

## Indexes (Recommend for MongoDB)

```javascript
// User
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ phone: 1 }, { unique: true })
db.users.createIndex({ role: 1 })

// RequestTicket
db.requesttickets.createIndex({ customerId: 1 })
db.requesttickets.createIndex({ status: 1 })
db.requesttickets.createIndex({ code: 1 }, { unique: true })

// Invoice
db.invoices.createIndex({ customerId: 1 })
db.invoices.createIndex({ requestTicketId: 1 })
db.invoices.createIndex({ status: 1 })
db.invoices.createIndex({ code: 1 }, { unique: true })
db.invoices.createIndex({ "assignment.vehicles.vehicleId": 1 })

// PriceList
db.pricelists.createIndex({ code: 1 }, { unique: true })
db.pricelists.createIndex({ isActive: 1 })

// Route
db.routes.createIndex({ code: 1 }, { unique: true })
db.routes.createIndex({ isActive: 1 })

// Vehicle
db.vehicles.createIndex({ licensePlate: 1 }, { unique: true })
db.vehicles.createIndex({ driverId: 1 })
```

## Relationship Summary

| From | To | Cardinality | Field |
|------|-----|-------------|-------|
| USER | - | 1 | _id (Customer, Driver, Dispatcher) |
| REQUESTTICKET | USER | N:1 | customerId |
| REQUESTTICKET | USER | N:1 | survey.dispatcherId |
| INVOICE | REQUESTTICKET | N:1 | requestTicketId |
| INVOICE | USER | N:1 | customerId |
| INVOICE | USER | N:1 | dispatcherId |
| INVOICE | ROUTE | N:1 | routeId |
| INVOICE | PRICELIST | N:1 | pricing.priceListId |
| INVOICE | VEHICLE | N:M | assignment.vehicles[].vehicleId |
| INVOICE | USER | N:M | assignment.vehicles[].driverIds |
| INVOICE | USER | N:M | assignment.vehicles[].staffIds |
| VEHICLE | USER | N:1 | driverId |
