require("dotenv").config();
const mongoose = require("mongoose");

const findYourTicket = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');
        
        const db = mongoose.connection.db;
        
        // Search for RT26020001 in both collections
        console.log('🔍 Searching for ticket RT26020001...\n');
        
        const requestTicketCollection = db.collection('RequestTicket');
        const requestticketsCollection = db.collection('requesttickets');
        
        const ticketInDesired = await requestTicketCollection.findOne({ code: 'RT26020001' });
        const ticketInOld = await requestticketsCollection.findOne({ code: 'RT26020001' });
        
        if (ticketInDesired) {
            console.log('✅ Found in "RequestTicket" collection (CORRECT):');
            console.log(`   ID: ${ticketInDesired._id}`);
            console.log(`   Code: ${ticketInDesired.code}`);
            console.log(`   Status: ${ticketInDesired.status}`);
            console.log(`   Customer: ${ticketInDesired.customerId}`);
        } else {
            console.log('❌ NOT found in "RequestTicket" collection');
        }
        
        console.log('');
        
        if (ticketInOld) {
            console.log('⚠️  Found in "requesttickets" collection (WRONG - needs migration):');
            console.log(`   ID: ${ticketInOld._id}`);
            console.log(`   Code: ${ticketInOld.code}`);
            console.log(`   Status: ${ticketInOld.status}`);
            console.log(`   Customer: ${ticketInOld.customerId}`);
        } else {
            console.log('✅ NOT found in "requesttickets" collection');
        }
        
        console.log('\n' + '═'.repeat(80));
        
        // Show all documents in both collections
        console.log('\n📊 ALL DOCUMENTS:\n');
        
        console.log('📁 RequestTicket collection:');
        const docsInDesired = await requestTicketCollection.find().toArray();
        console.log(`   Total: ${docsInDesired.length} documents`);
        docsInDesired.forEach((doc, i) => {
            console.log(`   ${i+1}. Code: ${doc.code}, Status: ${doc.status}`);
        });
        
        console.log('\n📁 requesttickets collection:');
        const docsInOld = await requestticketsCollection.find().toArray();
        console.log(`   Total: ${docsInOld.length} documents`);
        docsInOld.forEach((doc, i) => {
            console.log(`   ${i+1}. Code: ${doc.code}, Status: ${doc.status}`);
        });
        
        await mongoose.connection.close();
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

findYourTicket();
