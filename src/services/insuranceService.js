/**
 * Mock Insurance Service
 * Integrated with 3rd-party insurance providers (HOMS Protect, etc.)
 */

class InsuranceService {
  constructor() {
    this.packages = {
      'BASIC': {
        name: 'Gói Cơ bản',
        premiumRate: 0.005, // 0.5% giá trị hàng hóa
        coverageRate: 1.0,   // Đền bù 100% giá trị khai báo
        minPremium: 50000    // Phí tối thiểu 50k
      },
      'STANDARD': {
        name: 'Gói Tiêu chuẩn',
        premiumRate: 0.01,  // 1% giá trị hàng hóa
        coverageRate: 1.2,   // Đền bù 120% (bao gồm bồi thường tổn thất tinh thần)
        minPremium: 100000
      },
      'PREMIUM': {
        name: 'Gói Cao cấp',
        premiumRate: 0.02,  // 2% giá trị hàng hóa
        coverageRate: 1.5,   // Đền bù 150% 
        minPremium: 200000
      }
    };
  }

  /**
   * Tính toán phí bảo hiểm
   * @param {Number} declaredValue 
   * @param {String} packageId 
   */
  calculatePremium(declaredValue, packageId = 'BASIC') {
    const pkg = this.packages[packageId] || this.packages['BASIC'];
    let premium = declaredValue * pkg.premiumRate;
    
    // Đảm bảo không thấp hơn mức tối thiểu
    premium = Math.max(premium, pkg.minPremium);
    
    const coverage = declaredValue * pkg.coverageRate;

    return {
      packageId,
      packageName: pkg.name,
      premiumAmount: Math.round(premium),
      coverageAmount: Math.round(coverage),
      provider: 'HOMS_PROTECT_INSURANCE',
      policyNumber: `HOMS-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
    };
  }

  getAvailablePackages() {
    return Object.keys(this.packages).map(id => ({
      id,
      ...this.packages[id]
    }));
  }
}

module.exports = new InsuranceService();
