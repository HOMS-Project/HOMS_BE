# Backend Integration Guide - Moving Order Data

## Overview
This guide explains the data structure sent from the CreateMovingOrder page to the backend for processing.

## Data Structure

When the user clicks "Tiếp theo" (Next), the following data object is sent:

```javascript
const orderData = {
    // Service Information
    serviceId: 1,                    // 1=House, 2=Office, 3=Items, 4=Truck rental
    
    // Location Data
    pickupLocation: {
        lat: 10.762622,
        lng: 106.660172,
        address: "123 Nguyen Hue, District 1, Ho Chi Minh City",
        addressDetails: {
            houseNumber: "123",
            road: "Nguyen Hue",
            district: "District 1",
            city: "Ho Chi Minh City",
            postcode: "700000",
            coordinates: "10.762622, 106.660172"
        }
    },
    
    dropoffLocation: {
        lat: 10.782622,
        lng: 106.680172,
        address: "456 Le Loi, District 3, Ho Chi Minh City",
        addressDetails: {
            houseNumber: "456",
            road: "Le Loi",
            district: "District 3",
            city: "Ho Chi Minh City",
            postcode: "700000",
            coordinates: "10.782622, 106.680172"
        }
    },
    
    // Location Descriptions
    pickupDescription: "Tầng 5, có thang máy",
    dropoffDescription: "Tầng 2, không thang máy",
    
    // Moving Date & Time
    movingDate: "2026-03-15T09:00:00+07:00",  // ISO 8601 format
    
    // AI Detected Items (from image uploads)
    aiDetectedItems: {
        'bed': 2,
        'sofa': 1,
        'chair': 4,
        'fridge': 1,
        'tv': 2,
        'laptop': 1
    },
    
    // Manual Item Selection
    manualItems: {
        'bed': 3,
        'sofa': 1,
        'chair': 6,
        'wardrobe': 2,
        'fridge': 1,
        'tv': 1,
        'washing': 1
    },
    
    // House/Office Size
    houseSize: "3 Phòng ngủ\n1 Bếp",  // or "50-100m²\n15-30 nhân viên" for office
    
    // Packed Boxes
    packedBoxes: 15,
    
    // Additional Notes
    additionalNotes: "Có két sắt nặng 200kg, cần 2 người khiêng"
}
```

## Backend API Endpoint

### Create Moving Order

**Endpoint**: `POST /api/orders/create`

**Request Body**: JSON object as shown above

**Response**:
```javascript
{
    "success": true,
    "orderId": "ORD-2026-0001",
    "message": "Đơn hàng đã được tạo thành công",
    "data": {
        "orderId": "ORD-2026-0001",
        "estimatedPrice": 5000000,  // VND
        "estimatedDuration": 480,    // minutes
        "requiredVehicle": "7-ton truck",
        "requiredWorkers": 4
    }
}
```

## Backend Processing Steps

### 1. Data Validation

```javascript
// Required fields validation
const requiredFields = [
    'serviceId',
    'pickupLocation',
    'dropoffLocation',
    'movingDate'
];

// Validate location data
if (!pickupLocation.lat || !pickupLocation.lng) {
    return { error: "Invalid pickup location" };
}

if (!dropoffLocation.lat || !dropoffLocation.lng) {
    return { error: "Invalid dropoff location" };
}

// Validate date
const movingDateObj = new Date(movingDate);
if (movingDateObj < new Date()) {
    return { error: "Moving date cannot be in the past" };
}
```

### 2. Merge AI and Manual Items

The backend should combine AI detected items with manually selected items:

```javascript
function mergeItemCounts(aiItems, manualItems) {
    const mergedItems = {};
    
    // Start with manual items (user's explicit choices)
    Object.entries(manualItems).forEach(([key, count]) => {
        mergedItems[key] = count;
    });
    
    // Add AI detected items if not manually specified
    Object.entries(aiItems).forEach(([key, count]) => {
        if (!mergedItems[key]) {
            mergedItems[key] = count;
        }
        // Optional: You could also add AI count as reference
        // mergedItems[key + '_ai_detected'] = count;
    });
    
    return mergedItems;
}

// Usage
const finalItems = mergeItemCounts(
    orderData.aiDetectedItems,
    orderData.manualItems
);
```

### 3. Calculate Distance

```javascript
function calculateDistance(pickup, dropoff) {
    const R = 6371; // Earth's radius in km
    const dLat = (dropoff.lat - pickup.lat) * Math.PI / 180;
    const dLon = (dropoff.lng - pickup.lng) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(pickup.lat * Math.PI / 180) * 
              Math.cos(dropoff.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance; // in km
}
```

### 4. Estimate Price

```javascript
function estimatePrice(orderData) {
    const distance = calculateDistance(
        orderData.pickupLocation,
        orderData.dropoffLocation
    );
    
    // Count total items
    const totalItems = Object.values(orderData.manualItems)
        .reduce((sum, count) => sum + count, 0);
    
    // Base price
    let price = 500000; // VND base price
    
    // Distance cost (50,000 VND per km)
    price += distance * 50000;
    
    // Item cost (20,000 VND per item)
    price += totalItems * 20000;
    
    // Packed boxes (10,000 VND per box)
    price += orderData.packedBoxes * 10000;
    
    // Service type multiplier
    const serviceMultipliers = {
        1: 1.0,   // Regular house moving
        2: 1.3,   // Office moving (more complex)
        3: 0.8,   // Items only
        4: 0.6    // Truck rental only
    };
    price *= serviceMultipliers[orderData.serviceId] || 1.0;
    
    // Floor fees (if mentioned in descriptions)
    if (orderData.pickupDescription.includes('tầng')) {
        price += 100000; // per floor
    }
    if (orderData.dropoffDescription.includes('tầng')) {
        price += 100000;
    }
    
    return Math.round(price);
}
```

### 5. Estimate Duration

```javascript
function estimateDuration(orderData) {
    const distance = calculateDistance(
        orderData.pickupLocation,
        orderData.dropoffLocation
    );
    
    const totalItems = Object.values(orderData.manualItems)
        .reduce((sum, count) => sum + count, 0);
    
    // Base time: 2 hours
    let duration = 120; // minutes
    
    // Travel time (assume 30 km/h in city)
    duration += (distance / 30) * 60;
    
    // Loading time (5 minutes per item)
    duration += totalItems * 5;
    
    // Packing time if needed
    duration += orderData.packedBoxes * 3;
    
    return Math.round(duration);
}
```

### 6. Recommend Vehicle & Workers

```javascript
function recommendResources(orderData) {
    const totalItems = Object.values(orderData.manualItems)
        .reduce((sum, count) => sum + count, 0);
    
    let vehicle, workers;
    
    // Determine vehicle size
    if (totalItems <= 10 && orderData.packedBoxes <= 10) {
        vehicle = '3-ton truck';
        workers = 2;
    } else if (totalItems <= 20 && orderData.packedBoxes <= 20) {
        vehicle = '5-ton truck';
        workers = 3;
    } else {
        vehicle = '7-ton truck';
        workers = 4;
    }
    
    // Heavy items require more workers
    const heavyItems = ['fridge', 'washing', 'wardrobe'];
    const heavyCount = heavyItems.reduce((count, item) => 
        count + (orderData.manualItems[item] || 0), 0
    );
    
    if (heavyCount > 3) {
        workers += 1;
    }
    
    return { vehicle, workers };
}
```

## Database Schema

### Orders Table

```javascript
{
    orderId: String,          // Primary key: "ORD-2026-0001"
    userId: ObjectId,         // Reference to User
    serviceId: Number,        // 1, 2, 3, or 4
    
    // Locations
    pickupLocation: {
        type: Object,
        required: true,
        lat: Number,
        lng: Number,
        address: String,
        addressDetails: Object
    },
    dropoffLocation: {
        type: Object,
        required: true,
        lat: Number,
        lng: Number,
        address: String,
        addressDetails: Object
    },
    
    pickupDescription: String,
    dropoffDescription: String,
    
    movingDate: Date,
    
    // Items
    aiDetectedItems: {
        type: Map,
        of: Number
    },
    manualItems: {
        type: Map,
        of: Number
    },
    finalItems: {           // Merged AI + Manual
        type: Map,
        of: Number
    },
    
    houseSize: String,
    packedBoxes: Number,
    additionalNotes: String,
    
    // Estimates
    estimatedPrice: Number,
    estimatedDuration: Number,  // minutes
    distance: Number,           // km
    
    // Resources
    requiredVehicle: String,
    requiredWorkers: Number,
    
    // Status
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'assigned', 'in-progress', 'completed', 'cancelled'],
        default: 'pending'
    },
    
    // Payment
    depositAmount: Number,
    depositPaid: Boolean,
    finalAmount: Number,
    
    timestamps: true
}
```

## Example Backend Implementation (Node.js/Express)

```javascript
// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/create', authMiddleware, orderController.createOrder);

module.exports = router;
```

```javascript
// controllers/orderController.js
exports.createOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const orderData = req.body;
        
        // Validate data
        if (!orderData.serviceId || !orderData.pickupLocation || !orderData.dropoffLocation) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }
        
        // Merge items
        const finalItems = mergeItemCounts(
            orderData.aiDetectedItems || {},
            orderData.manualItems || {}
        );
        
        // Calculate estimates
        const distance = calculateDistance(
            orderData.pickupLocation,
            orderData.dropoffLocation
        );
        
        const estimatedPrice = estimatePrice(orderData);
        const estimatedDuration = estimateDuration(orderData);
        const { vehicle, workers } = recommendResources(orderData);
        
        // Generate order ID
        const orderId = await generateOrderId();
        
        // Create order in database
        const order = await Order.create({
            orderId,
            userId,
            ...orderData,
            finalItems,
            estimatedPrice,
            estimatedDuration,
            distance,
            requiredVehicle: vehicle,
            requiredWorkers: workers,
            depositAmount: estimatedPrice * 0.3, // 30% deposit
            status: 'pending'
        });
        
        res.status(201).json({
            success: true,
            orderId: order.orderId,
            message: 'Đơn hàng đã được tạo thành công',
            data: {
                orderId: order.orderId,
                estimatedPrice: order.estimatedPrice,
                estimatedDuration: order.estimatedDuration,
                requiredVehicle: order.requiredVehicle,
                requiredWorkers: order.requiredWorkers,
                depositAmount: order.depositAmount
            }
        });
        
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo đơn hàng'
        });
    }
};
```

## Testing

### Sample Test Data

```javascript
// Test case 1: Small house move
{
    "serviceId": 1,
    "pickupLocation": {
        "lat": 10.762622,
        "lng": 106.660172,
        "address": "123 Test Street"
    },
    "dropoffLocation": {
        "lat": 10.782622,
        "lng": 106.680172,
        "address": "456 Test Avenue"
    },
    "movingDate": "2026-03-15T09:00:00+07:00",
    "manualItems": {
        "bed": 2,
        "sofa": 1,
        "chair": 4
    },
    "houseSize": "2 Phòng ngủ\n1 Bếp",
    "packedBoxes": 10,
    "additionalNotes": "Test order"
}
```

### cURL Test Command

```bash
curl -X POST http://localhost:5000/api/orders/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d @test-order.json
```

## Notes for Backend Developers

1. **Merge Strategy**: Manual items take priority over AI detected items
2. **Validation**: Always validate coordinates are within service area
3. **Price Calculation**: Adjust multipliers based on your business model
4. **Date Handling**: Convert all dates to UTC for storage
5. **Error Handling**: Provide clear error messages in Vietnamese
6. **Logging**: Log all order creation attempts for analytics
7. **Notifications**: Send confirmation SMS/email after order creation
8. **Payment**: Integrate with payment gateway for deposit

## Security Considerations

- Validate user authentication before accepting orders
- Sanitize all text inputs (descriptions, notes)
- Validate coordinate ranges (lat: -90 to 90, lng: -180 to 180)
- Rate limit order creation to prevent spam
- Store sensitive data (addresses) securely with encryption

---

**Last Updated**: February 25, 2026
**API Version**: 1.0.0
