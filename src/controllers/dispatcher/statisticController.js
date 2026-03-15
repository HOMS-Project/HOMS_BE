const RequestTicket = require('../../models/RequestTicket');
const Invoice = require('../../models/Invoice');
const User = require('../../models/User');

exports.getDispatcherStats = async (req, res, next) => {
    try {
        // Stats for RequestTickets
        const ticketStats = await RequestTicket.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Stats for Invoices
        const invoiceStats = await Invoice.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Format stats into a more usable object
        const stats = {
            tickets: {
                total: 0,
                CREATED: 0,
                WAITING_SURVEY: 0,
                SURVEYED: 0,
                QUOTED: 0,
                ACCEPTED: 0,
                CONVERTED: 0,
                CANCELLED: 0
            },
            invoices: {
                total: 0,
                DRAFT: 0,
                CONFIRMED: 0,
                ASSIGNED: 0,
                IN_PROGRESS: 0,
                COMPLETED: 0,
                CANCELLED: 0
            }
        };

        ticketStats.forEach(item => {
            if (stats.tickets[item._id] !== undefined) {
                stats.tickets[item._id] = item.count;
                stats.tickets.total += item.count;
            }
        });

        invoiceStats.forEach(item => {
            if (stats.invoices[item._id] !== undefined) {
                stats.invoices[item._id] = item.count;
                stats.invoices.total += item.count;
            }
        });

        // Get some recent tickets for display
        const recentTickets = await RequestTicket.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('customerId', 'fullName email phone')
            .populate('dispatcherId', 'fullName');

        // Get some recent invoices for display
        const recentInvoices = await Invoice.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('customerId', 'fullName email phone')
            .populate({
                path: 'requestTicketId',
                select: 'code dispatcherId',
                populate: {
                    path: 'dispatcherId',
                    select: 'fullName'
                }
            });

        res.status(200).json({
            success: true,
            data: {
                stats,
                recentTickets,
                recentInvoices
            }
        });
    } catch (error) {
        next(error);
    }
};
