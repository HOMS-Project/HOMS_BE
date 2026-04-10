const DISTRICT_MAP = {
  NGU_HANH_SON: "Ngũ Hành Sơn",
  THANH_KHE: "Thanh Khê",
  HAI_CHAU: "Hải Châu",
  SON_TRA: "Sơn Trà",
  LIEN_CHIEU: "Liên Chiểu",
  CAM_LE: "Cẩm Lệ",
  HOA_VANG: "Hòa Vang",
};

const formatDistrict = (district) => {
  if (!district) return "Chưa xác định";
  return DISTRICT_MAP[district] || district;
};

module.exports = { formatDistrict };