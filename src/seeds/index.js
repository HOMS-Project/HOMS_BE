/**
 * Complete Seed Script
 * Import tất cả seed data vào MongoDB
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('../models/User');
const PriceList = require('../models/PriceList');
const Route = require('../models/Route');
const RequestTicket = require('../models/RequestTicket');
const Invoice = require('../models/Invoice');
const Vehicle = require('../models/Vehicle');
const Incident = require('../models/Incident');
const MaintenanceSchedule = require('../models/MaintenanceSchedule');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const Promotion = require('../models/Promotion');
const ServiceRating = require('../models/ServiceRating');
const Transaction = require('../models/Transaction');

// Import seed data
const priceListData = require('./priceListData');
const routeData = require('./routeData');
const requestTicketData = require('./requestTicketData');
const invoiceData = require('./invoiceData');
const incidentData = require('./incidentData');
const maintenanceData = require('./maintenanceData');
const messageData = require('./messageData');
const notificationData = require('./notificationData');
const promotionData = require('./promotionData');
const serviceRatingData = require('./serviceRatingData');
const transactionData = require('./transactionData');

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('🧹 Clearing existing collections...');
    await User.deleteMany({});
    await PriceList.deleteMany({});
    await Route.deleteMany({});
    await RequestTicket.deleteMany({});
    await Invoice.deleteMany({});
    await Vehicle.deleteMany({});
    console.log('✅ Collections cleared\n');

    // 1. Create Users (Customer, Driver, Dispatcher)
    console.log('👥 Creating users...');
    const customer1 = await User.create({
      fullName: 'Nguyễn Văn A',
      email: 'customerA@example.com',
      phone: '0912345678',
      password: 'hash123',
      role: 'Customer',
      status: 'Active',
      avatar: 'https://example.com/avatar_a.jpg'
    });

    const customer2 = await User.create({
      fullName: 'Trần Thị B',
      email: 'customerB@example.com',
      phone: '0987654321',
      password: 'hash123',
      role: 'Customer',
      status: 'Active',
      avatar: 'https://example.com/avatar_b.jpg'
    });

    const driver1 = await User.create({
      fullName: 'Lê Văn C',
      email: 'driverC@example.com',
      phone: '0909090909',
      password: 'hash123',
      role: 'Driver',
      status: 'Active',
      driverProfile: {
        licenseNumber: 'DL123456',
        skills: ['Bốc xếp', 'Lái xe tải'],
        isAvailable: true
      }
    });

    const dispatcher1 = await User.create({
      fullName: 'Phạm Văn D',
      email: 'dispatching@example.com',
      phone: '0888888888',
      password: 'hash123',
      role: 'Dispatcher',
      status: 'Active'
    });

    console.log(`✅ Created ${[customer1, customer2, driver1, dispatcher1].length} users\n`);

    // 2. Create Vehicles
    console.log('🚗 Creating vehicles...');
    const vehicle1 = await Vehicle.create({
      plateNumber: '51A-00001',
      vehicleType: 'Truck',
      loadCapacity: 2000,
      status: 'Available',
      cargoSpace: {
        length: 5,
        width: 2,
        height: 2
      }
    });

    const vehicle2 = await Vehicle.create({
      plateNumber: '51A-00002',
      vehicleType: 'Truck',
      loadCapacity: 1000,
      status: 'Available',
      cargoSpace: {
        length: 3.5,
        width: 1.8,
        height: 1.8
      }
    });

    console.log(`✅ Created ${[vehicle1, vehicle2].length} vehicles\n`);

    // 3. Create PriceList
    console.log('💰 Creating price list...');
    const priceLists = await PriceList.create(priceListData);
    console.log(`✅ Created ${priceLists.length} price list(s)\n`);

    // 4. Create Routes
    console.log('🗺️ Creating routes...');
    const routes = await Route.create(routeData);
    console.log(`✅ Created ${routes.length} route(s)\n`);

    // 5. Create RequestTickets
    console.log('📝 Creating request tickets...');
    // Update ticket data with real user IDs
    const updatedTicketData = requestTicketData.map((ticket, index) => ({
      ...ticket,
      customerId: index === 0 ? customer1._id : customer2._id,
      survey: {
        ...ticket.survey,
        dispatcherId: dispatcher1._id
      }
    }));

    const tickets = await RequestTicket.create(updatedTicketData);
    console.log(`✅ Created ${tickets.length} request ticket(s)\n`);

    // 6. Create Invoices
    console.log('📄 Creating invoices...');
    const updatedInvoiceData = invoiceData.map((inv, index) => ({
      ...inv,
      customerId: index === 0 ? customer1._id : customer2._id,
      dispatcherId: dispatcher1._id,
      requestTicketId: tickets[index]._id,
      routeId: routes[index % routes.length]._id,
      pricing: {
        ...inv.pricing,
        priceListId: priceLists[0]._id
      },
      assignment: {
        ...inv.assignment,
        vehicles: [
          {
            ...inv.assignment.vehicles[0],
            vehicleId: vehicle1._id,
            driverIds: [driver1._id],
            staffIds: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()]
          }
        ]
      }
    }));

    const invoices = await Invoice.create(updatedInvoiceData);
    console.log(`✅ Created ${invoices.length} invoice(s)\n`);

    // 6. Create Incidents
    console.log('🚨 Creating incidents...');
    const incidents = await Incident.create(incidentData);
    console.log(`✅ Created ${incidents.length} incident(s)\n`);

    // 7. Create MaintenanceSchedules
    console.log('🔧 Creating maintenance schedules...');
    const maintenances = await MaintenanceSchedule.create(maintenanceData);
    console.log(`✅ Created ${maintenances.length} maintenance schedule(s)\n`);

    // 8. Create Messages
    console.log('💬 Creating messages...');
    const messages = await Message.create(messageData);
    console.log(`✅ Created ${messages.length} message(s)\n`);

    // 9. Create Notifications
    console.log('🔔 Creating notifications...');
    const notifications = await Notification.create(notificationData);
    console.log(`✅ Created ${notifications.length} notification(s)\n`);

    // 10. Create Promotions
    console.log('🎉 Creating promotions...');
    const promotions = await Promotion.create(promotionData);
    console.log(`✅ Created ${promotions.length} promotion(s)\n`);

    // 11. Create ServiceRatings
    console.log('⭐ Creating service ratings...');
    const ratings = await ServiceRating.create(serviceRatingData);
    console.log(`✅ Created ${ratings.length} service rating(s)\n`);

    // 12. Create Transactions
    console.log('💳 Creating transactions...');
    const transactions = await Transaction.create(transactionData);
    console.log(`✅ Created ${transactions.length} transaction(s)\n`);

    // Print summary
    console.log('📊 ═══════════════════════════════════════');
    console.log('    SEEDING COMPLETE - SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`Users:          ${[customer1, customer2, driver1, dispatcher1].length}`);
    console.log(`Vehicles:       ${[vehicle1, vehicle2].length}`);
    console.log(`Price Lists:    ${priceLists.length}`);
    console.log(`Routes:         ${routes.length}`);
    console.log(`Tickets:        ${tickets.length}`);
    console.log(`Invoices:       ${invoices.length}`);
    console.log(`Incidents:      ${incidents.length}`);
    console.log(`Maintenance:    ${maintenances.length}`);
    console.log(`Messages:       ${messages.length}`);
    console.log(`Notifications:  ${notifications.length}`);
    console.log(`Promotions:     ${promotions.length}`);
    console.log(`Ratings:        ${ratings.length}`);
    console.log(`Transactions:   ${transactions.length}`);
    console.log('═══════════════════════════════════════\n');

    console.log('📌 Sample Data Created:');
    console.log(`\nCustomer 1: ${customer1.fullName} (${customer1.email})`);
    console.log(`Dispatcher: ${dispatcher1.fullName} (${dispatcher1.email})`);
    console.log(`\nTicket 1: ${tickets[0].code}`);
    console.log(`  - Type: ${tickets[0].type}`);
    console.log(`  - Status: ${tickets[0].status}`);
    console.log(`\nInvoice 1: ${invoices[0].code}`);
    console.log(`  - Total Price: ${invoices[0].pricing.totalPrice.toLocaleString()} VND`);
    console.log(`  - Status: ${invoices[0].status}`);
    console.log(`  - Vehicles: ${invoices[0].assignment.vehicles.length}\n`);

    await mongoose.connection.close();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
