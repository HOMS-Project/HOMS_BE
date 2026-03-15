const bcrypt = require('bcryptjs');

const testHash = '$2b$10$S52KozyhOt8Y0dNV2cX9.OcpJVZ9gzl3DJG/kzFHikBQBpsORK8vC'; // From mongo_seed.js for Cam Le
const passwordsToTest = [
    'CamLe123@',
    'Camle123@',
    'camle123@',
    'Cẩm Lệ123@',
    'CẩmLệ123@'
];

async function test() {
    console.log('Testing Hash for Cam Le:');
    for (const pw of passwordsToTest) {
        const isMatch = await bcrypt.compare(pw, testHash);
        console.log(`Password: "${pw}" -> Match: ${isMatch}`);
    }
}

test();
