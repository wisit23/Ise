import config from "./customerServiceConfig";

export const DISPUTE_TYPES = [
  ["ITEM_NOT_AS_DESCRIBED", "สินค้าไม่ตรงรายละเอียด"],
  ["DAMAGED_ITEM", "สินค้าชำรุดหรือเสียหาย"],
  ["WRONG_ITEM", "ได้รับสินค้าผิดรายการ"],
  ["OTHER", "ปัญหาอื่นเกี่ยวกับสินค้า"],
];
export const DECISION_LABELS = {
  APPROVE_REFUND: "อนุมัติคืนเงินให้ผู้ซื้อ",
  RELEASE_ESCROW: "ปล่อยเงินให้ผู้ขาย",
  REJECT: "ไม่อนุมัติคำร้อง",
};
export function caseStage(dispute) {
  if (dispute.status === "DECIDED")
    return {
      label: "พิจารณาเสร็จแล้ว",
      step: 3,
      tone: "done",
      description:
        "ดูผลการพิจารณาและเหตุผลด้านล่าง บทสนทนาจะเก็บไว้ให้ย้อนดูได้",
    };
  if (dispute.status === "NEEDS_INFO")
    return {
      label: "รอข้อมูลเพิ่มเติม",
      step: 1,
      tone: "waiting",
      description:
        "อ่านคำขอในแชตกับเจ้าหน้าที่ แล้วแนบหลักฐานหรือคำชี้แจงเพิ่มเติม",
    };
  if (dispute.assignedRole === "ADMIN")
    return {
      label: "รอผลการพิจารณา",
      step: 2,
      tone: "review",
      description:
        "CS ส่งเรื่องให้ผู้ดูแลพิจารณาแล้ว คุณยังแนบหลักฐานเพิ่มเติมได้จนกว่าจะตัดสิน",
    };
  if (dispute.assignedTo)
    return {
      label: "เจ้าหน้าที่กำลังตรวจสอบ",
      step: 1,
      tone: "review",
      description:
        "ส่งหลักฐานและคำชี้แจงผ่านหน้านี้ เจ้าหน้าที่จะรวบรวมข้อมูลจากทั้งสองฝ่าย",
    };
  return {
    label: "รอเจ้าหน้าที่รับเรื่อง",
    step: 0,
    tone: "waiting",
    description:
      "คำร้องเข้าสู่ระบบแล้ว ระหว่างรอคุณสามารถแนบหลักฐานและฝากข้อความถึงเจ้าหน้าที่ได้",
  };
}
export function evidenceError(files) {
  if (files.length > config.evidence.maxFiles)
    return `เลือกได้ครั้งละไม่เกิน ${config.evidence.maxFiles} ไฟล์`;
  const invalid = files.find(
    (file) => !config.evidence.mimeTypes.includes(file.type),
  );
  if (invalid)
    return `${invalid.name}: รองรับรูป JPG, PNG, WebP, GIF และวิดีโอ MP4, MOV`;
  const large = files.find((file) => file.size > config.evidence.maxFileBytes);
  if (large)
    return `${large.name}: ไฟล์ต้องไม่เกิน ${config.evidence.maxFileBytes / 1024 / 1024} MB`;
  return "";
}
export function caseDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "—";
  return new Date(value).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}
