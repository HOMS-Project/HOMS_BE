const RequestTicket = require('../models/RequestTicket');
const User = require('../models/User');
const AppError = require('../utils/appErrors');

// Generate unique request ticket code
const generateTicketCode = async () => {
    const prefix = 'RT';
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    
    // Find the last ticket created today
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));
    
    const lastTicket = await RequestTicket.findOne({
        createdAt: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ createdAt: -1 });
    
    let sequence = 1;
    if (lastTicket && lastTicket.code) {
        const lastSequence = parseInt(lastTicket.code.slice(-4));
        sequence = lastSequence + 1;
    }
    
    const code = `${prefix}${year}${month}${String(sequence).padStart(4, '0')}`;
    return code;
};

// Calculate distance between two coordinates (Haversine formula)
const calculateDistance = (pickup, delivery) => {
    const R = 6371; // Earth's radius in km
    const dLat = (delivery.coordinates.lat - pickup.coordinates.lat) * Math.PI / 180;
    const dLon = (delivery.coordinates.lng - pickup.coordinates.lng) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(pickup.coordinates.lat * Math.PI / 180) * 
              Math.cos(delivery.coordinates.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return parseFloat(distance.toFixed(2)); // km
};

// Map frontend data to backend schema
const mapOrderDataToTicket = (orderData, customerId) => {
    const ticketData = {
        customerId,
        moveType: orderData.serviceId === 1 || orderData.serviceId === 2 ? 'FULL_HOUSE' : 'SPECIFIC_ITEMS',
        pickup: {
            address: orderData.pickupLocation.address,
            coordinates: {
                lat: orderData.pickupLocation.lat,
                lng: orderData.pickupLocation.lng
            }
        },
        delivery: {
            address: orderData.dropoffLocation.address,
            coordinates: {
                lat: orderData.dropoffLocation.lat,
                lng: orderData.dropoffLocation.lng
            }
        },
        items: [],
        notes: ''
    };
    
    // Build notes from descriptions
    const noteParts = [];
    if (orderData.pickupDescription) {
        noteParts.push(`Nơi lấy hàng: ${orderData.pickupDescription}`);
    }
    if (orderData.dropoffDescription) {
        noteParts.push(`Nơi giao hàng: ${orderData.dropoffDescription}`);
    }
    if (orderData.houseSize) {
        noteParts.push(`Quy mô: ${orderData.houseSize}`);
    }
    if (orderData.additionalNotes) {
        noteParts.push(`Ghi chú: ${orderData.additionalNotes}`);
    }
    if (orderData.movingDate) {
        const date = new Date(orderData.movingDate);
        noteParts.push(`Thời gian dự kiến: ${date.toLocaleString('vi-VN')}`);
    }
    ticketData.notes = noteParts.join('\n');
    
    // Convert manual items to items array
    if (orderData.manualItems && Object.keys(orderData.manualItems).length > 0) {
        Object.entries(orderData.manualItems).forEach(([itemKey, quantity]) => {
            // Map item keys to Vietnamese names
            const itemNames = {
                'bed': 'Giường',
                'sofa': 'Sofa',
                'chair': 'Ghế',
                'wardrobe': 'Tủ quần áo',
                'fridge': 'Tủ lạnh',
                'tv': 'TV',
                'washing': 'Máy giặt',
                'desk': 'Bàn làm việc',
                'office-chair': 'Ghế văn phòng',
                'computer': 'Máy tính',
                'printer': 'Máy in',
                'filing': 'Tủ hồ sơ',
                'server': 'Server',
                'laptop': 'Laptop'
            };
            
            ticketData.items.push({
                name: itemNames[itemKey] || itemKey,
                quantity,
                notes: `Từ danh sách ${orderData.serviceId === 1 ? 'đồ nội thất' : 'thiết bị văn phòng'}`
            });
        });
    }
    
    // Add packed boxes as an item
    if (orderData.packedBoxes && orderData.packedBoxes > 0) {
        ticketData.items.push({
            name: 'Thùng đã đóng gói',
            quantity: orderData.packedBoxes,
            notes: 'Thùng carton đã đóng gói sẵn'
        });
    }
    
    // Add AI detected items as notes if different from manual
    if (orderData.aiDetectedItems && Object.keys(orderData.aiDetectedItems).length > 0) {
        const aiItemsNote = Object.entries(orderData.aiDetectedItems)
            .map(([key, count]) => `${key}: ${count}`)
            .join(', ');
        ticketData.notes += `\n\nAI phát hiện: ${aiItemsNote}`;
    }
    
    // Calculate estimated distance
    ticketData.estimatedDistance = calculateDistance(ticketData.pickup, ticketData.delivery);
    
    // Add survey information if provided
    if (orderData.survey) {
        ticketData.survey = {
            type: orderData.survey.type, // 'ONLINE' or 'OFFLINE'
            date: new Date(orderData.survey.date),
            status: 'WAITING',
            notes: orderData.survey.timeSlot ? `Khung giờ: ${orderData.survey.timeSlot}` : ''
        };
        
        // Update status to WAITING_SURVEY if survey is scheduled
        ticketData.status = 'WAITING_SURVEY';
    }
    
    return ticketData;
};

// Create request ticket
exports.createRequestTicket = async (orderData, customerId) => {
    try {
        // Validate customer exists
        const customer = await User.findById(customerId);
        if (!customer) {
            throw new AppError('Không tìm thấy thông tin khách hàng', 404);
        }
        
        // Validate required fields
        if (!orderData.pickupLocation || !orderData.dropoffLocation) {
            throw new AppError('Thiếu thông tin địa điểm', 400);
        }
        
        if (!orderData.pickupLocation.lat || !orderData.pickupLocation.lng) {
            throw new AppError('Địa chỉ lấy hàng không hợp lệ', 400);
        }
        
        if (!orderData.dropoffLocation.lat || !orderData.dropoffLocation.lng) {
            throw new AppError('Địa chỉ giao hàng không hợp lệ', 400);
        }
        
        // Generate ticket code
        const code = await generateTicketCode();
        
        // Map frontend data to backend schema
        const ticketData = mapOrderDataToTicket(orderData, customerId);
        ticketData.code = code;
        
        // Set initial status if not already set by survey data
        if (!ticketData.status) {
            ticketData.status = 'CREATED';
        }
        
        console.log('📝 Creating ticket with data:', JSON.stringify(ticketData, null, 2));
        
        // Create ticket
        const requestTicket = await RequestTicket.create(ticketData);
        
        console.log('✅ Ticket created successfully:', requestTicket._id);
        
        // Verify it was saved to database
        const savedTicket = await RequestTicket.findById(requestTicket._id);
        if (!savedTicket) {
            throw new AppError('Ticket was created but not found in database!', 500);
        }
        console.log('✓ Database verification passed - ticket exists in DB');
        
        // Populate customer info
        await requestTicket.populate('customerId', 'fullName email phoneNumber');
        
        console.log('📤 Returning populated ticket:', requestTicket.code);
        
        return requestTicket;
        
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }
        throw new AppError('Lỗi khi tạo yêu cầu dịch vụ: ' + error.message, 500);
    }
};

// Get request ticket by ID
exports.getRequestTicketById = async (ticketId, userId) => {
    const ticket = await RequestTicket.findById(ticketId)
        .populate('customerId', 'fullName email phoneNumber')
        .populate('dispatcherId', 'fullName email');
    
    if (!ticket) {
        throw new AppError('Không tìm thấy yêu cầu dịch vụ', 404);
    }
    
    // Check if user has permission to view this ticket
    if (ticket.customerId._id.toString() !== userId) {
        throw new AppError('Bạn không có quyền xem yêu cầu này', 403);
    }
    
    return ticket;
};

// Get all tickets for a customer
exports.getCustomerTickets = async (customerId, filters = {}) => {
    const query = { customerId };
    
    // Apply status filter if provided
    if (filters.status) {
        query.status = filters.status;
    }
    
    const tickets = await RequestTicket.find(query)
        .populate('customerId', 'fullName email phoneNumber')
        .populate('dispatcherId', 'fullName email')
        .sort({ createdAt: -1 });
    
    return tickets;
};

// Update ticket status
exports.updateTicketStatus = async (ticketId, status, userId) => {
    const ticket = await RequestTicket.findById(ticketId);
    
    if (!ticket) {
        throw new AppError('Không tìm thấy yêu cầu dịch vụ', 404);
    }
    
    // Check permission
    if (ticket.customerId.toString() !== userId) {
        throw new AppError('Bạn không có quyền cập nhật yêu cầu này', 403);
    }
    
    // Validate status transition
    const validTransitions = {
        'CREATED': ['WAITING_SURVEY', 'CANCELLED'],
        'WAITING_SURVEY': ['SURVEYED', 'CANCELLED'],
        'SURVEYED': ['PRICE_QUOTED', 'CANCELLED'],
        'PRICE_QUOTED': ['ACCEPTED', 'CANCELLED'],
        'ACCEPTED': ['CANCELLED'],
        'CANCELLED': []
    };
    
    if (!validTransitions[ticket.status].includes(status)) {
        throw new AppError(`Không thể chuyển từ trạng thái ${ticket.status} sang ${status}`, 400);
    }
    
    ticket.status = status;
    await ticket.save();
    
    return ticket;
};

// Cancel ticket
exports.cancelTicket = async (ticketId, userId) => {
    return exports.updateTicketStatus(ticketId, 'CANCELLED', userId);
};

module.exports = exports;
