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
const SurveyData = require('../models/SurveyData');
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
    await SurveyData.deleteMany({});
    await Invoice.deleteMany({});
    await Vehicle.deleteMany({});
    console.log('✅ Collections cleared\n');

    // 1. Create Users (Customer, Driver, Dispatcher, Admin)
    console.log('👥 Creating users...');
    const defaultHash = "$2b$10$iS.T70xViBOK59WpEwh.IeHytz8AKcEV5QIbuJO.m6U.YLdSf.KXe"; // "User123@"
    
    const adminHash = "$2b$10$3fqaOu900PZqEh6tw0d2duWD48h3jOP0fz3pW86JfYa8UiJsByO0C"; // "Admin123@"
    const adminUser = await User.create({
      fullName: 'Quản trị viên Hệ thống',
      email: 'homsAdmin@homs.com',
      phone: '0999999999',
      password: adminHash,
      role: 'admin',
      status: 'Active'
    });

    const customer1 = await User.create({
      fullName: 'Nguyễn Văn A',
      email: 'customerA@example.com',
      phone: '0912345678',
      password: defaultHash,
      role: 'customer',
      status: 'Active',
      avatar: 'https://example.com/avatar_a.jpg'
    });

    const customer2 = await User.create({
      fullName: 'Trần Thị B',
      email: 'customerB@example.com',
      phone: '0987654321',
      password: defaultHash,
      role: 'customer',
      status: 'Active',
      avatar: 'https://example.com/avatar_b.jpg'
    });

    const driver1 = await User.create({
      fullName: 'Lê Văn C',
      email: 'driverC@example.com',
      phone: '0909090909',
      password: defaultHash,
      role: 'driver',
      status: 'Active',
      driverProfile: {
        licenseNumber: 'DL123456',
        skills: ['Bốc xếp', 'Lái xe tải'],
        isAvailable: true
      }
    });

    const dispatchersData = [
      {
        fullName: "Điều phối viên Tổng",
        email: "head.dispatcher@homs.com",
        password: defaultHash,
        role: "dispatcher",
        status: "Active",
        dispatcherProfile: { workingAreas: [], isGeneral: true, isAvailable: true }
      },
      {
        fullName: "Điều phối viên Hải Châu",
        email: "haichau.disp@homs.com",
        password: defaultHash,
        role: "dispatcher",
        status: "Active",
        dispatcherProfile: { workingAreas: ["Hải Châu"], isGeneral: false, isAvailable: true }
      },
      {
        fullName: "Điều phối viên Thanh Khê",
        email: "thanhkhe.disp@homs.com",
        password: defaultHash,
        role: "dispatcher",
        status: "Active",
        dispatcherProfile: { workingAreas: ["Thanh Khê"], isGeneral: false, isAvailable: true }
      },
      {
        fullName: "Điều phối viên Sơn Trà",
        email: "sontra.disp@homs.com",
        password: defaultHash,
        role: "dispatcher",
        status: "Active",
        dispatcherProfile: { workingAreas: ["Sơn Trà"], isGeneral: false, isAvailable: true }
      },
      {
        fullName: "Điều phối viên Ngũ Hành Sơn",
        email: "nguhanhson.disp@homs.com",
        password: defaultHash,
        role: "dispatcher",
        status: "Active",
        dispatcherProfile: { workingAreas: ["Ngũ Hành Sơn"], isGeneral: false, isAvailable: true }
      },
      {
        fullName: "Điều phối viên Liên Chiểu",
        email: "lienchieu.disp@homs.com",
        password: defaultHash,
        role: "dispatcher",
        status: "Active",
        dispatcherProfile: { workingAreas: ["Liên Chiểu"], isGeneral: false, isAvailable: true }
      },
      {
        fullName: "Điều phối viên Cẩm Lệ",
        email: "camle.disp@homs.com",
        password: defaultHash,
        role: "dispatcher",
        status: "Active",
        dispatcherProfile: { workingAreas: ["Cẩm Lệ"], isGeneral: false, isAvailable: true }
      },
      {
        fullName: "Điều phối viên Hòa Vang",
        email: "hoavang.disp@homs.com",
        password: defaultHash,
        role: "dispatcher",
        status: "Active",
        dispatcherProfile: { workingAreas: ["Hòa Vang"], isGeneral: false, isAvailable: true }
      }
    ];

    const dispatchers = await User.insertMany(dispatchersData);
    const dispatcher1 = dispatchers[0]; // head dispatcher

    console.log(`✅ Created ${[customer1, customer2, driver1, adminUser].length + dispatchers.length} users\n`);

    // 2. Create Vehicles
    console.log('🚗 Creating vehicles...');
    const vehicle1 = await Vehicle.create({
      vehicleId: 'VHC-001',
      plateNumber: '51A-00001',
      vehicleType: '2TON',
      loadCapacity: 2000,
      status: 'Available'
    });

    const vehicle2 = await Vehicle.create({
      vehicleId: 'VHC-002',
      plateNumber: '51A-00002',
      vehicleType: '1TON',
      loadCapacity: 1000,
      status: 'Available'
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

    
      const surveyDocs = tickets.map((t, idx) => { const mockTicket = updatedTicketData[idx]; return { requestTicketId: t._id, surveyType: mockTicket.surveyType || 'ONLINE', status: mockTicket.status === 'CREATED' ? 'SCHEDULED' : 'COMPLETED', surveyorId: mockTicket.survey?.dispatcherId || dispatcher1._id, items: t.items || [], suggestedVehicle: mockTicket.survey?.recommendedVehicles?.[0] === '500kg' ? '500KG' : '1TON', suggestedStaffCount: mockTicket.survey?.staffCount || 2, estimatedHours: 2, distanceKm: 5, floors: 0, totalActualWeight: mockTicket.survey?.estimatedWeight || 0, totalActualVolume: mockTicket.survey?.estimatedVolume || 0, notes: mockTicket.survey?.notes || '', }; });
      const createdSurveys = await SurveyData.create(surveyDocs);
      console.log('✅ Created survey data(s)\n');

    // 6. Create PricingData & DispatchAssignment & Invoices
    console.log('📄 Creating pricing data, assignments and invoices...');
    
    // Create PricingData
    const pricingDataDocs = tickets.map((t, index) => ({
      requestTicketId: t._id,
      surveyDataId: createdSurveys[index]._id,
      priceListId: priceLists[0]._id,
      subtotal: invoiceData[index].priceSnapshot.subtotal,
      tax: invoiceData[index].priceSnapshot.tax,
      totalPrice: invoiceData[index].priceSnapshot.totalPrice
    }));
    const PricingData = require('../models/PricingData');
    const pricingDatas = await PricingData.create(pricingDataDocs);

    // Create Invoices (first pass)
    const updatedInvoiceData = invoiceData.map((inv, index) => ({
      ...inv,
      customerId: index === 0 ? customer1._id : customer2._id,
      requestTicketId: tickets[index]._id,
      routeId: routes[index % routes.length]._id,
      pricingDataId: pricingDatas[index]._id,
      surveyDataId: createdSurveys[index]._id
    }));
    const invoices = await Invoice.create(updatedInvoiceData);

    // Create DispatchAssignment
    const DispatchAssignment = require('../models/DispatchAssignment');
    const assignmentDocs = invoices.map((inv, index) => ({
      invoiceId: inv._id,
      assignments: [{
        vehicleId: vehicle1._id,
        driverIds: [driver1._id],
        staffIds: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()]
      }],
      status: 'CONFIRMED'
    }));
    const assignments = await DispatchAssignment.create(assignmentDocs);

    // Update Invoices with DispatchAssignment
    for (let i = 0; i < invoices.length; i++) {
      invoices[i].dispatchAssignmentId = assignments[i]._id;
      await invoices[i].save();
    }
    console.log(`✅ Created ${invoices.length} invoice(s) with pricing and assignment\n`);

    // 6. Create Incidents
    console.log('🚨 Creating incidents...');
    const updatedIncidentData = incidentData.map(inc => ({
      ...inc,
      invoiceId: invoices[0]._id, // Attach to the first invoice
      reporterId: driver1._id,
      orderId: undefined // Remove old orderId if exists
    }));
    const incidents = await Incident.create(updatedIncidentData);
    console.log(`✅ Created ${incidents.length} incident(s)\n`);

    // 7. Create MaintenanceSchedules
    console.log('🔧 Creating maintenance schedules...');
    const updatedMaintenanceData = maintenanceData.map((mnt, idx) => ({
      ...mnt,
      vehicleId: idx % 2 === 0 ? vehicle1._id : vehicle2._id,
      mechanic: dispatcher1._id,
      createdBy: dispatcher1._id
    }));
    const maintenances = await MaintenanceSchedule.create(updatedMaintenanceData);
    console.log(`✅ Created ${maintenances.length} maintenance schedule(s)\n`);

    // 8. Create Messages
    console.log('💬 Creating messages...');
    const updatedMessageData = [
      {
        senderId: customer1._id,
        recipientId: dispatcher1._id,
        content: 'Xin chào, tôi muốn đặt lịch chuyển nhà vào ngày 8/1',
        type: 'Text',
        context: { type: 'Invoice', refId: invoices[0]._id },
        readBy: [{ userId: dispatcher1._id, readAt: new Date() }]
      },
      {
        senderId: dispatcher1._id,
        recipientId: customer1._id,
        content: 'Cảm ơn bạn, chúng tôi sẽ liên hệ với bạn trong vòng 1 giờ để xác nhận',
        type: 'Text',
        context: { type: 'Invoice', refId: invoices[0]._id },
        readBy: [{ userId: customer1._id, readAt: new Date() }]
      }
    ];
    const messages = await Message.create(updatedMessageData);
    console.log(`✅ Created ${messages.length} message(s)\n`);

    // 9. Create Notifications
    console.log('🔔 Creating notifications...');
    const updatedNotificationData = notificationData.map(notif => ({
      ...notif,
      userId: customer1._id,
      ticketId: tickets[0]._id,
      type: 'System',
      orderId: undefined
    }));
    const notifications = await Notification.create(updatedNotificationData);
    console.log(`✅ Created ${notifications.length} notification(s)\n`);

    // 10. Create Promotions
    console.log('🎉 Creating promotions...');
    const promotions = await Promotion.create(promotionData);
    console.log(`✅ Created ${promotions.length} promotion(s)\n`);

    // 11. Create ServiceRatings
    console.log('⭐ Creating service ratings...');
    const updatedRatingData = serviceRatingData.map(rt => ({
      ...rt,
      invoiceId: invoices[0]._id,
      customerId: customer1._id,
      driverId: driver1._id,
      vehicleId: vehicle1._id,
      orderId: undefined
    }));
    // Take only 1 rating to avoid unique index conflict on invoiceId
    const ratings = await ServiceRating.create([updatedRatingData[0]]);
    console.log(`✅ Created ${ratings.length} service rating(s)\n`);

    // 12. Create Transactions
    console.log('💳 Creating transactions...');
    const updatedTransactionData = transactionData.map((trx, index) => ({
      ...trx,
      invoiceId: invoices[index % invoices.length]._id,
      paymentMethod: trx.paymentMethod === 'Banking' ? 'Bank Transfer' : trx.paymentMethod,
      orderId: undefined
    }));
    const transactions = await Transaction.create(updatedTransactionData);
    console.log(`✅ Created ${transactions.length} transaction(s)\n`);

    // Print summary
    console.log('📊 ═══════════════════════════════════════');
    console.log('    SEEDING COMPLETE - SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`Users:          ${[customer1, customer2, driver1, adminUser].length + dispatchers.length}`);
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
    console.log(`  - Total Price: ${invoices[0].priceSnapshot.totalPrice.toLocaleString()} VND`);
    console.log(`  - Status: ${invoices[0].status}`);
    console.log(`  - Payment Status: ${invoices[0].paymentStatus}\n`);

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
