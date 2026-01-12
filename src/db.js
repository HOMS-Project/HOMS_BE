/**
 * Database Management Script
 * Dùng để clear database và seed data
 * 
 * Usage:
 * npm run db:clear   - Clear all collections
 * npm run db:seed    - Seed sample data
 * npm run db:reset   - Clear + Seed (reset complete)
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import all models
const User = require('./models/User');
const Order = require('./models/Order');
const Invoice = require('./models/Invoice');
const RequestTicket = require('./models/RequestTicket');
const PriceList = require('./models/PriceList');
const Route = require('./models/Route');
const Message = require('./models/Message');
const Incident = require('./models/Incident');
const Notification = require('./models/Notification');
const Transaction = require('./models/Transaction');
const Vehicle = require('./models/Vehicle');
const MaintenanceSchedule = require('./models/MaintenanceSchedule');
const Promotion = require('./models/Promotion');
const ServiceRating = require('./models/ServiceRating');

const seedDatabase = require('./seeds/index');

const command = process.argv[2];

async function clearDatabase() {
  try {
    console.log('🧹 Clearing database...');
    
    await User.deleteMany({});
    await Order.deleteMany({});
    await Invoice.deleteMany({});
    await RequestTicket.deleteMany({});
    await PriceList.deleteMany({});
    await Route.deleteMany({});
    await Message.deleteMany({});
    await Incident.deleteMany({});
    await Notification.deleteMany({});
    await Transaction.deleteMany({});
    await Vehicle.deleteMany({});
    await MaintenanceSchedule.deleteMany({});
    await Promotion.deleteMany({});
    await ServiceRating.deleteMany({});
    
    console.log('✅ Database cleared successfully!\n');
  } catch (error) {
    console.error('❌ Error clearing database:', error.message);
    throw error;
  }
}

async function runSeeding() {
  try {
    console.log('🌱 Seeding database...\n');
    await seedDatabase();
    console.log('✅ Seeding completed successfully!\n');
  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
    throw error;
  }
}

async function main() {
  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    if (command === 'clear') {
      await clearDatabase();
    } else if (command === 'seed') {
      await runSeeding();
    } else if (command === 'reset') {
      await clearDatabase();
      await runSeeding();
    } else {
      console.log(`
Usage:
  node src/db.js clear    - Clear all collections
  node src/db.js seed     - Seed sample data
  node src/db.js reset    - Clear + Seed (recommended)

Or use npm scripts:
  npm run db:clear
  npm run db:seed
  npm run db:reset
      `);
    }

    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

main();
