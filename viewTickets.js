require("dotenv").config();
const mongoose = require("mongoose");

const viewTickets = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB\n');
        
        // Load models
        const RequestTicket = require('./src/models/RequestTicket');
        const User = require('./src/models/User');
        
        const tickets = await RequestTicket.find()
            .populate('customerId', 'fullName email phoneNumber')
            .sort({ createdAt: -1 })
            .limit(10);
        
        console.log(`📋 Found ${tickets.length} ticket(s):\n`);
        console.log('═'.repeat(80));
        
        tickets.forEach((ticket, index) => {
            console.log(`\n🎫 TICKET #${index + 1}`);
            console.log('─'.repeat(80));
            console.log(`📌 ID: ${ticket._id}`);
            console.log(`🔖 Code: ${ticket.code}`);
            console.log(`📊 Status: ${ticket.status}`);
            console.log(`🏠 Move Type: ${ticket.moveType}`);
            
            if (ticket.customerId) {
                console.log(`\n👤 CUSTOMER:`);
                console.log(`   Name: ${ticket.customerId.fullName || 'N/A'}`);
                console.log(`   Email: ${ticket.customerId.email || 'N/A'}`);
                console.log(`   Phone: ${ticket.customerId.phoneNumber || 'N/A'}`);
            }
            
            console.log(`\n📍 LOCATIONS:`);
            console.log(`   Pickup: ${ticket.pickup?.address || 'N/A'}`);
            if (ticket.pickup?.coordinates) {
                console.log(`   Coordinates: ${ticket.pickup.coordinates.lat}, ${ticket.pickup.coordinates.lng}`);
            }
            console.log(`   Delivery: ${ticket.delivery?.address || 'N/A'}`);
            if (ticket.delivery?.coordinates) {
                console.log(`   Coordinates: ${ticket.delivery.coordinates.lat}, ${ticket.delivery.coordinates.lng}`);
            }
            console.log(`   Distance: ${ticket.estimatedDistance || 'N/A'} km`);
            
            if (ticket.items && ticket.items.length > 0) {
                console.log(`\n📦 ITEMS: (${ticket.items.length} items)`);
                ticket.items.forEach((item, i) => {
                    console.log(`   ${i+1}. ${item.name} × ${item.quantity}`);
                    if (item.notes) console.log(`      Note: ${item.notes}`);
                });
            }
            
            if (ticket.notes) {
                console.log(`\n📝 NOTES:`);
                const noteLines = ticket.notes.split('\n');
                noteLines.forEach(line => {
                    if (line.trim()) console.log(`   ${line.trim()}`);
                });
            }
            
            console.log(`\n🕐 TIMESTAMPS:`);
            console.log(`   Created: ${ticket.createdAt}`);
            console.log(`   Updated: ${ticket.updatedAt}`);
            console.log('═'.repeat(80));
        });
        
        await mongoose.connection.close();
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

viewTickets();
