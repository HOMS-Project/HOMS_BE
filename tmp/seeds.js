const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const districts = [
    { name: 'Hải Châu', email: 'haichau.disp@homs.com', pw: 'Haichau123@' },
    { name: 'Thanh Khê', email: 'thanhkhe.disp@homs.com', pw: 'Thanhkhe123@' },
    { name: 'Sơn Trà', email: 'sontra.disp@homs.com', pw: 'Sontra123@' },
    { name: 'Ngũ Hành Sơn', email: 'nguhanhson.disp@homs.com', pw: 'Nguhanhson123@' },
    { name: 'Liên Chiểu', email: 'lienchieu.disp@homs.com', pw: 'Lienchieu123@' },
    { name: 'Cẩm Lệ', email: 'camle.disp@homs.com', pw: 'Camle123@' },
    { name: 'Hòa Vang', email: 'hoavang.disp@homs.com', pw: 'Hoavang123@' }
];

async function gen() {
    const users = [];

    // 1. Head Dispatcher (General)
    const headPw = await bcrypt.hash('Head123@', 10);
    users.push({
        fullName: 'Điều phối viên Tổng',
        email: 'head.dispatcher@homs.com',
        password: headPw,
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

    const output = `// MongoDB Shell Command to Insert Dispatchers:\ndb.users.insertMany(${JSON.stringify(users, null, 2)});`;
    const outputPath = path.join(__dirname, 'mongo_seed_final.js');
    fs.writeFileSync(outputPath, output, 'utf8');
    console.log(`Saved seed to ${outputPath}`);
}

gen();
