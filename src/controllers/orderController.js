const orderService = require('../services/orderService');
const AppError = require('../utils/appErrors');

// Validate order data (no authentication required)
// Used to check if order can be created before user logs in
exports.validateOrderData = async (req, res, next) => {
    try {
        const orderData = req.body;

        console.log('🔍 Validating order data (no auth required)');

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

        res.status(200).json({
            success: true,
            message: 'Dữ liệu đơn hàng hợp lệ',
            requiresAuth: true, // Inform FE that authentication is required to proceed
            data: {
                isValid: true,
                estimatedDistance: orderService.calculateDistance(
                    orderData.pickupLocation,
                    orderData.dropoffLocation
                )
            }
        });

    } catch (error) {
        console.error('❌ Error validating order:', error);
        next(error);
    }
};

// Create new order/request ticket (requires authentication)
exports.createOrder = async (req, res, next) => {
    try {
        // Check if user is authenticated
        if (!req.user || !req.user.id) {
            throw new AppError('Vui lòng đăng nhập để tạo yêu cầu dịch vụ', 401);
        }

        const userId = req.user.id;
        const orderData = req.body;

        console.log('📦 Creating order for user:', userId);
        console.log('Order data:', JSON.stringify(orderData, null, 2));

        // Create request ticket
        const requestTicket = await orderService.createRequestTicket(orderData, userId);

        console.log('✅ Order created successfully with ID:', requestTicket._id);

        res.status(201).json({
            success: true,
            message: 'Yêu cầu dịch vụ đã được tạo thành công',
            data: {
                ticketId: requestTicket._id,
                code: requestTicket.code,
                status: requestTicket.status,
                estimatedDistance: requestTicket.estimatedDistance,
                pickup: requestTicket.pickup,
                delivery: requestTicket.delivery,
                items: requestTicket.items,
                createdAt: requestTicket.createdAt
            }
        });

        console.log('📤 Response sent to client for ticket:', requestTicket.code);

    } catch (error) {
        console.error('❌ Error creating order:', error);
        next(error);
    }
};

// Get order by ID
exports.getOrderById = async (req, res, next) => {
    try {
        const { ticketId } = req.params;
        const userId = req.user.id;

        const ticket = await orderService.getRequestTicketById(ticketId, userId);

        res.status(200).json({
            success: true,
            data: ticket
        });

    } catch (error) {
        console.error('❌ Error fetching order:', error);
        next(error);
    }
};

// Get all orders for current user
exports.getMyOrders = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { status } = req.query;

        const filters = {};
        if (status) {
            filters.status = status;
        }

        console.log("User from token:", req.user);

        const tickets = await orderService.getCustomerTickets(userId, filters);

        res.status(200).json({
            success: true,
            count: tickets.length,
            data: tickets
        });

    } catch (error) {
        console.error('❌ Error fetching orders:', error);
        next(error);
    }
};

// Cancel order
exports.cancelOrder = async (req, res, next) => {
    try {
        const { ticketId } = req.params;
        const userId = req.user.id;

        const ticket = await orderService.cancelTicket(ticketId, userId);

        res.status(200).json({
            success: true,
            message: 'Yêu cầu đã được hủy',
            data: ticket
        });

    } catch (error) {
        console.error('❌ Error cancelling order:', error);
        next(error);
    }
};

module.exports = exports;
