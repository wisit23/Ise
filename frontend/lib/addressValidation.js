export function validateAddressContact(address) {
  const errors = {};
  const value = (field) =>
    typeof address[field] === "string" ? address[field].trim() : "";
  if (!value("recipientName")) errors.recipientName = "กรุณากรอกชื่อผู้รับ";
  if (!/^[0-9]{10}$/.test(value("phone"))) {
    errors.phone = "เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก";
  }
  if (!/^[0-9]{5}$/.test(value("postalCode"))) {
    errors.postalCode = "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก";
  }
  return errors;
}
