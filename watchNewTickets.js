require("dotenv").config();
const mongoose = require("mongoose");

const watchCollection = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');
        
        const db = mongoose.connection.db;
        const requestTicketCollection = db.collection('RequestTicket');
        
        // Get initial count
        const initialCount = await requestTicketCollection.countDocuments();
        console.log(`📊 Current count in "RequestTicket" collection: ${initialCount}\n`);
        
        // Show existing tickets
        console.log('📋 Existing tickets:');
        const existing = await requestTicketCollection.find().sort({ createdAt: -1 }).toArray();
        if (existing.length === 0) {
            console.log('   (none)\n');
        } else {
            existing.forEach((doc, i) => {
                console.log(`   ${i+1}. ${doc.code} - ${doc.status} - ${doc.createdAt}`);
            });
            console.log('');
        }
        
        console.log('👀 Watching for new documents...');
        console.log('   (Create an order from the frontend, then press Ctrl+C to exit)\n');
        console.log('═'.repeat(80));
        
        // Poll every 2 seconds
        let lastCount = initialCount;
        const interval = setInterval(async () => {
            try {
                const currentCount = await requestTicketCollection.countDocuments();
                
                if (currentCount > lastCount) {
                    console.log(`\n🎉 NEW TICKET DETECTED! Count: ${lastCount} → ${currentCount}`);
                    
                    // Get the new ticket
                    const newTickets = await requestTicketCollection
                        .find()
                        .sort({ createdAt: -1 })
                        .limit(currentCount - lastCount)
                        .toArray();
                    
                    newTickets.forEach((doc) => {
                        console.log('\n✅ NEW TICKET SAVED TO "RequestTicket" COLLECTION:');
                        console.log(`   Code: ${doc.code}`);
                        console.log(`   Status: ${doc.status}`);
                        console.log(`   Customer ID: ${doc.customerId}`);
                        console.log(`   Move Type: ${doc.moveType}`);
                        console.log(`   Distance: ${doc.estimatedDistance} km`);
                        console.log(`   Items: ${doc.items?.length || 0} items`);
                        console.log(`   Created: ${doc.createdAt}`);
                        console.log('\n🎊 SUCCESS! The fix is working correctly!');
                    });
                    
                    lastCount = currentCount;
                }
            } catch (error) {
                console.error('Error polling:', error.message);
            }
        }, 2000);
        
        // Handle Ctrl+C
        process.on('SIGINT', async () => {
            clearInterval(interval);
            console.log('\n\n👋 Stopping watch...');
            await mongoose.connection.close();
            process.exit(0);
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

watchCollection();
