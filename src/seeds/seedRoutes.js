/**
 * seedRoutes.js
 * Seeds Da Nang district routes into the Route collection.
 * Run: node src/seeds/seedRoutes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Route = require('../models/Route');

const DA_NANG_DISTRICTS = [
    'HAI_CHAU', 'THANH_KHE', 'SON_TRA', 'NGU_HANH_SON', 'LIEN_CHIEU', 'CAM_LE'
];

// Generate routes for every district pair (bidirectional)
const routes = [];
for (let i = 0; i < DA_NANG_DISTRICTS.length; i++) {
    for (let j = i + 1; j < DA_NANG_DISTRICTS.length; j++) {
        const from = DA_NANG_DISTRICTS[i];
        const to = DA_NANG_DISTRICTS[j];
        routes.push({
            code: `DN-${from}-${to}`,
            name: `${from} → ${to}`,
            area: 'Đà Nẵng',
            fromDistrict: from,
            toDistrict: to,
            isActive: true,
            estimatedDistanceKm: null,
            estimatedDurationMin: null,
            routeSurcharge: 0,
            routeDiscountRate: 0
        });
    }
}

async function seed() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Remove old routes with PascalCase districts (legacy)
    const deleted = await Route.deleteMany({
        $or: [
            { fromDistrict: { $regex: /^[A-Z][a-z]/ } }, // PascalCase
            { fromDistrict: { $exists: false } }
        ]
    });
    console.log(`Deleted ${deleted.deletedCount} legacy routes`);

    // Insert all district-pair routes (skip if already exists)
    for (const r of routes) {
        await Route.updateOne(
            { code: r.code },
            { $setOnInsert: r },
            { upsert: true }
        );
        console.log(`✅ Upserted: ${r.code}`);
    }

    console.log(`\nDone. ${routes.length} routes seeded.`);
    await mongoose.disconnect();
}

seed().catch(err => {
    console.error(err);
    process.exit(1);
});
