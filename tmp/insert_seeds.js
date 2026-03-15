const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../src/models/User');
const bcrypt = require('bcryptjs');

dotenv.config();

const dbUrl = process.env.MONGO_URI || 'mongodb://localhost:27017/homs';

const districts = [
    { name: 'Hải Châu', email: 'haichau.disp@homs.com', pw: 'Haichau123@' },
    { name: 'Thanh Khê', email: 'thanhkhe.disp@homs.com', pw: 'Thanhkhe123@' },
    { name: 'Sơn Trà', email: 'sontra.disp@homs.com', pw: 'Sontra123@' },
    { name: 'Ngũ Hành Sơn', email: 'nguhanhson.disp@homs.com', pw: 'Nguhanhson123@' },
    { name: 'Liên Chiểu', email: 'lienchieu.disp@homs.com', pw: 'Lienchieu123@' },
    { name: 'Cẩm Lệ', email: 'camle.disp@homs.com', pw: 'Camle123@' },
    { name: 'Hòa Vang', email: 'hoavang.disp@homs.com', pw: 'Hoavang123@' }
];

async function insertSeeds() {
    try {
        await mongoose.connect(dbUrl);
        console.log('Connected to MongoDB');

        // Optional: Clear existing dispatchers if you want a clean slate
        // await User.deleteMany({ role: 'dispatcher' });

        const users = [];

        // 1. Head Dispatcher
        const headHashed = await bcrypt.hash('Head123@', 10);
        users.push({
            fullName: 'Điều phối viên Tổng',
            email: 'head.dispatcher@homs.com',
            password: headHashed,
            role: 'dispatcher',
            status: 'Active',
            dispatcherProfile: {
                workingAreas: [],
                isGeneral: true,
                isAvailable: true
            }
        });

        // 2. Regional Dispatchers
        for (const d of districts) {
            const hash = await bcrypt.hash(d.pw, 10);
            users.push({
                fullName: `Điều phối viên ${d.name}`,
                email: d.email,
                password: hash,
                role: 'dispatcher',
                status: 'Active',
                dispatcherProfile: {
                    workingAreas: [d.name],
                    isGeneral: false,
                    isAvailable: true
                }
            });
        }

        // Insert using insertMany (this will trigger valiation, but not lowercase/trim if defined on schema unless runValidators is true)
        // Since we explicitly lowercase email in seeds.js logic (wait, I didn't lowercase in users.push, but I should)
        
        for (let u of users) {
          u.email = u.email.toLowerCase();
          // Check if exists to avoid duplicates
          const exists = await User.findOne({ email: u.email });
          if (exists) {
            console.log(`User ${u.email} already exists, skipping...`);
          } else {
            await User.create(u);
            console.log(`Created user: ${u.email}`);
          }
        }

        console.log('Seed insertion completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error inserting seeds:', error);
        process.exit(1);
    }
}

insertSeeds();
