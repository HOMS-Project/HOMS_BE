require("dotenv").config();
const mongoose = require("mongoose");

const checkDatabase = async () => {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');
        
        const db = mongoose.connection.db;
        
        // List all collections
        console.log('\n📋 Collections in database:');
        const collections = await db.listCollections().toArray();
        collections.forEach(col => console.log(`  - ${col.name}`));
        
        // Check if requesttickets collection exists and count documents
        const RequestTicket = require('./src/models/RequestTicket');
        const ticketCount = await RequestTicket.countDocuments();
        console.log(`\n📊 Total RequestTickets in database: ${ticketCount}`);
        
        if (ticketCount > 0) {
            const latestTicket = await RequestTicket.findOne().sort({ createdAt: -1 });
            console.log('\n🎫 Latest ticket:');
            console.log(`  - ID: ${latestTicket._id}`);
            console.log(`  - Code: ${latestTicket.code}`);
            console.log(`  - Status: ${latestTicket.status}`);
            console.log(`  - Created: ${latestTicket.createdAt}`);
        } else {
            console.log('\n⚠️  No tickets found in database');
        }
        
        await mongoose.connection.close();
        console.log('\n✅ Database check complete');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

checkDatabase();
