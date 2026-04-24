const routeData = [
  {
    code: 'NGUYEN_TAT_THANH',
    name: 'Nguyễn Tất Thành',
    area: 'Da_Nang',
    district: 'THANH_KHE',
    estimatedDistanceKm: 12,
    trafficRules: [
      {
        ruleType: 'PEAK_HOUR',
        startTime: '06:30',
        endTime: '08:30',
        restrictedVehicles: ['1.5T', '2.5T', '3.5T', '5.5T', '10.5T', 'CONTAINER'],
        note: 'Cấm xe tải giờ cao điểm sáng'
      },
      {
        ruleType: 'PEAK_HOUR',
        startTime: '16:00',
        endTime: '19:00',
        restrictedVehicles: ['1.5T', '2.5T', '3.5T', '5.5T', '10.5T', 'CONTAINER'],
        note: 'Cấm xe tải giờ cao điểm chiều'
      }
    ]
  },
  {
    code: 'DIEN_BIEN_PHU',
    name: 'Điện Biên Phủ',
    area: 'Da_Nang',
    district: 'THANH_KHE',
    estimatedDistanceKm: 3.5,
    trafficRules: [
      {
        ruleType: 'TRUCK_BAN',
        startTime: '06:00',
        endTime: '22:00',
        restrictedVehicles: ['2.5T', '3.5T', '5.5T', '10.5T', 'CONTAINER'],
        note: 'Cấm xe tải >2.5T ban ngày'
      },
      {
        ruleType: 'PEAK_HOUR',
        startTime: '06:30',
        endTime: '08:30',
        restrictedVehicles: ['1.5T'],
        note: 'Cấm xe tải 1.5T giờ sáng'
      },
      {
        ruleType: 'PEAK_HOUR',
        startTime: '16:00',
        endTime: '19:00',
        restrictedVehicles: ['1.5T'],
        note: 'Cấm xe tải 1.5T giờ chiều'
      }
    ]
  },
  {
    code: 'NGUYEN_HUU_THO',
    name: 'Nguyễn Hữu Thọ',
    area: 'Da_Nang',
    district: 'HAI_CHAU',
    estimatedDistanceKm: 5,
    trafficRules: [
      {
        ruleType: 'PEAK_HOUR',
        startTime: '06:30',
        endTime: '08:30',
        restrictedVehicles: ['1.5T', '2.5T', '3.5T', '5.5T', '10.5T'],
        note: 'Cấm xe tải giờ cao điểm sáng'
      },
      {
        ruleType: 'PEAK_HOUR',
        startTime: '16:00',
        endTime: '19:00',
        restrictedVehicles: ['1.5T', '2.5T', '3.5T', '5.5T', '10.5T'],
        note: 'Cấm xe tải giờ cao điểm chiều'
      }
    ]
  },
  {
    code: '2_THANG_9',
    name: '2 Tháng 9',
    area: 'Da_Nang',
    district: 'HAI_CHAU',
    estimatedDistanceKm: 4,
    trafficRules: [
      {
        ruleType: 'TRUCK_BAN',
        startTime: '06:00',
        endTime: '22:00',
        restrictedVehicles: ['2.5T', '3.5T', '5.5T', '10.5T', 'CONTAINER'],
        note: 'Cấm xe tải >2.5T ban ngày'
      }
    ]
  },
  {
    code: 'NGUYEN_TRI_PHUONG',
    name: 'Nguyễn Tri Phương',
    area: 'Da_Nang',
    district: 'HAI_CHAU',
    estimatedDistanceKm: 2.8,
    trafficRules: [
      {
        ruleType: 'PEAK_HOUR',
        startTime: '06:30',
        endTime: '08:30',
        restrictedVehicles: ['1.5T', '2.5T', '3.5T', '5.5T'],
        note: 'Cấm xe tải giờ cao điểm sáng'
      },
      {
        ruleType: 'PEAK_HOUR',
        startTime: '16:00',
        endTime: '19:00',
        restrictedVehicles: ['1.5T', '2.5T', '3.5T', '5.5T'],
        note: 'Cấm xe tải giờ cao điểm chiều'
      }
    ]
  },
  {
    code: 'TRAN_CAO_VAN',
    name: 'Trần Cao Vân',
    area: 'Da_Nang',
    district: 'THANH_KHE',
    estimatedDistanceKm: 4.2,
    trafficRules: [
      {
        ruleType: 'TRUCK_BAN',
        startTime: '06:00',
        endTime: '22:00',
        restrictedVehicles: ['2.5T', '3.5T', '5.5T', '10.5T'],
        note: 'Cấm xe tải >2.5T ban ngày'
      }
    ]
  },
  {
    code: 'LE_THANH_NGHI',
    name: 'Lê Thanh Nghị',
    area: 'Da_Nang',
    district: 'HAI_CHAU',
    estimatedDistanceKm: 2.5,
    trafficRules: [
      {
        ruleType: 'TRUCK_BAN',
        startTime: '06:00',
        endTime: '22:00',
        restrictedVehicles: ['2.5T', '3.5T', '5.5T', '10.5T', 'CONTAINER'],
        note: 'Cấm xe tải >2.5T ban ngày (Lưu thông 22:00 - 06:00)'
      }
    ]
  }
];

module.exports = routeData;
