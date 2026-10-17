export const REPORT_CATEGORIES = [
  { value: "FRAUD", label: "หลอกลวงหรือฉ้อโกง" },
  { value: "COUNTERFEIT_IP", label: "สินค้าปลอมหรือละเมิดลิขสิทธิ์" },
  { value: "INAPPROPRIATE_BEHAVIOR", label: "เนื้อหาหรือพฤติกรรมไม่เหมาะสม" },
  { value: "MISLEADING_INFORMATION", label: "ข้อมูลร้านค้าหรือสินค้าไม่ตรงความจริง" },
  { value: "OTHER", label: "อื่น ๆ" },
];

export function reportCategoryLabel(value) {
  return REPORT_CATEGORIES.find((category) => category.value === value)?.label || "ไม่ระบุประเภท";
}
