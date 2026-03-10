// Vietnam 2025 administrative reform: 63 → 34 provinces
// Effective July 1, 2025 (Resolution No. 60-NQ/TW)
// Maps new province slug → array of old province slugs from zipcodes.js

var PROVINCE_MERGERS = [
  // 11 Unchanged
  { name: "Hà Nội", slug: "ha-noi", old: ["ha-noi"] },
  { name: "Huế", slug: "thua-thien-hue", old: ["thua-thien-hue"] },
  { name: "Lai Châu", slug: "lai-chau", old: ["lai-chau"] },
  { name: "Điện Biên", slug: "dien-bien", old: ["dien-bien"] },
  { name: "Sơn La", slug: "son-la", old: ["son-la"] },
  { name: "Lạng Sơn", slug: "lang-son", old: ["lang-son"] },
  { name: "Quảng Ninh", slug: "quang-ninh", old: ["quang-ninh"] },
  { name: "Thanh Hóa", slug: "thanh-hoa", old: ["thanh-hoa"] },
  { name: "Nghệ An", slug: "nghe-an", old: ["nghe-an"] },
  { name: "Hà Tĩnh", slug: "ha-tinh", old: ["ha-tinh"] },
  { name: "Cao Bằng", slug: "cao-bang", old: ["cao-bang"] },

  // 23 Merged
  { name: "Tuyên Quang", slug: "tuyen-quang", old: ["tuyen-quang", "ha-giang"] },
  { name: "Lào Cai", slug: "lao-cai", old: ["lao-cai", "yen-bai"] },
  { name: "Thái Nguyên", slug: "thai-nguyen", old: ["thai-nguyen", "bac-kan"] },
  { name: "Phú Thọ", slug: "phu-tho", old: ["phu-tho", "vinh-phuc", "hoa-binh"] },
  { name: "Bắc Ninh", slug: "bac-ninh", old: ["bac-ninh", "bac-giang"] },
  { name: "Hưng Yên", slug: "hung-yen", old: ["hung-yen", "thai-binh"] },
  { name: "Hải Phòng", slug: "hai-phong", old: ["hai-phong", "hai-duong"] },
  { name: "Ninh Bình", slug: "ninh-binh", old: ["ninh-binh", "nam-dinh", "ha-nam"] },
  { name: "Quảng Trị", slug: "quang-tri", old: ["quang-tri", "quang-binh"] },
  { name: "Đà Nẵng", slug: "da-nang", old: ["da-nang", "quang-nam"] },
  { name: "Quảng Ngãi", slug: "quang-ngai", old: ["quang-ngai", "kon-tum"] },
  { name: "Gia Lai", slug: "gia-lai", old: ["gia-lai", "binh-dinh"] },
  { name: "Khánh Hòa", slug: "khanh-hoa", old: ["khanh-hoa", "ninh-thuan"] },
  { name: "Lâm Đồng", slug: "lam-dong", old: ["lam-dong", "dak-nong", "binh-thuan"] },
  { name: "Đắk Lắk", slug: "dak-lak", old: ["dak-lak", "phu-yen"] },
  { name: "Hồ Chí Minh", slug: "ho-chi-minh", old: ["ho-chi-minh", "binh-duong", "ba-ria-vung-tau"] },
  { name: "Đồng Nai", slug: "dong-nai", old: ["dong-nai", "binh-phuoc"] },
  { name: "Tây Ninh", slug: "tay-ninh", old: ["tay-ninh", "long-an"] },
  { name: "Cần Thơ", slug: "can-tho", old: ["can-tho", "soc-trang", "hau-giang"] },
  { name: "Vĩnh Long", slug: "vinh-long", old: ["vinh-long", "ben-tre", "tra-vinh"] },
  { name: "Đồng Tháp", slug: "dong-thap", old: ["dong-thap", "tien-giang"] },
  { name: "Cà Mau", slug: "ca-mau", old: ["ca-mau", "bac-lieu"] },
  { name: "An Giang", slug: "an-giang", old: ["an-giang", "kien-giang"] },
];
