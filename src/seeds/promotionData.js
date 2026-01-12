/**
 * Seed data cho Promotion
 * Các chương trình khuyến mãi
 */

const mongoose = require('mongoose');

const mockCreatedById = new mongoose.Types.ObjectId();

const promotionData = [
  {
    code: 'NEWYEAR20',
    description: 'Khuyến mãi Tết Nguyên Đán - Giảm 20% cho khách hàng mới',
    discountType: 'Percentage',
    discountValue: 20,
    maxDiscount: 2000000,
    minOrderAmount: 2000000,
    usageLimit: 100,
    usageCount: 5,
    validFrom: new Date('2026-01-01'),
    validUntil: new Date('2026-02-15'),
    applicableServices: ['FULL_HOUSE', 'SPECIFIC_ITEMS'],
    applicableAreas: ['Q1', 'Q3', 'Q5', 'Q7'],
    status: 'Active',
    createdBy: mockCreatedById
  },
  {
    code: 'FLAT500K',
    description: 'Giảm cố định 500K cho đơn hàng trên 5 triệu',
    discountType: 'FixedAmount',
    discountValue: 500000,
    maxDiscount: 500000,
    minOrderAmount: 5000000,
    usageLimit: 50,
    usageCount: 12,
    validFrom: new Date('2026-01-07'),
    validUntil: new Date('2026-01-31'),
    applicableServices: ['FULL_HOUSE'],
    applicableAreas: ['Q1', 'Q3', 'Q7', 'Q2', 'Q9'],
    status: 'Active',
    createdBy: mockCreatedById
  },
  {
    code: 'STUDENT15',
    description: 'Giảm 15% cho sinh viên (bao gồm bạn bè sinh viên)',
    discountType: 'Percentage',
    discountValue: 15,
    maxDiscount: 1500000,
    minOrderAmount: 1500000,
    usageLimit: 200,
    usageCount: 35,
    validFrom: new Date('2025-09-01'),
    validUntil: new Date('2026-12-31'),
    applicableServices: ['FULL_HOUSE', 'SPECIFIC_ITEMS'],
    applicableAreas: ['Q1', 'Q3', 'Q5', 'Q7', 'Q2', 'Q9', 'Q10'],
    status: 'Active',
    createdBy: mockCreatedById
  },
  {
    code: 'EARLYBOOKING10',
    description: 'Giảm 10% khi đặt cách đó 7 ngày trở lên',
    discountType: 'Percentage',
    discountValue: 10,
    maxDiscount: 1000000,
    minOrderAmount: 2000000,
    usageLimit: 150,
    usageCount: 42,
    validFrom: new Date('2026-01-01'),
    validUntil: new Date('2026-03-31'),
    applicableServices: ['FULL_HOUSE', 'SPECIFIC_ITEMS'],
    applicableAreas: [],
    status: 'Active',
    createdBy: mockCreatedById
  },
  {
    code: 'BLACKFRIDAY50',
    description: 'Giảm 50% Black Friday (Hết hạn)',
    discountType: 'Percentage',
    discountValue: 50,
    maxDiscount: 5000000,
    minOrderAmount: 2000000,
    usageLimit: 100,
    usageCount: 98,
    validFrom: new Date('2025-11-28'),
    validUntil: new Date('2025-12-01'),
    applicableServices: ['FULL_HOUSE', 'SPECIFIC_ITEMS'],
    applicableAreas: ['Q1', 'Q3', 'Q5', 'Q7'],
    status: 'Expired',
    createdBy: mockCreatedById
  }
];

module.exports = promotionData;
