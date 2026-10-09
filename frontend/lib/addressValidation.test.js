import { validateAddressContact } from "./addressValidation";

const valid = {
  recipientName: "สมชาย",
  phone: "0812345678",
  postalCode: "10110",
};

test("valid contact fields, including surrounding whitespace, are accepted", () => {
  expect(validateAddressContact(valid)).toEqual({});
  expect(
    validateAddressContact({
      recipientName: " สมชาย ",
      phone: " 0812345678 ",
      postalCode: " 10110 ",
    }),
  ).toEqual({});
});

test.each(["12345", "abcdefghij", "081-2345678", 812345678, ""])(
  "invalid phone %s has a field error",
  (phone) => {
    expect(validateAddressContact({ ...valid, phone }).phone).toBe(
      "เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก",
    );
  },
);

test.each(["ABCDE", "1234", "123456", ""])(
  "invalid postal code %s has a field error",
  (postalCode) => {
    expect(validateAddressContact({ ...valid, postalCode }).postalCode).toBe(
      "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก",
    );
  },
);
