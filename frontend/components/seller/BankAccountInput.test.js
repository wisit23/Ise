import { render, screen, fireEvent } from "@testing-library/react";
import BankAccountInput, {
  BANK_OPTIONS,
  parseBankAccount,
  formatBankAccount,
  validateBankAccount,
} from "./BankAccountInput";

describe("BankAccountInput helpers", () => {
  test("parseBankAccount parses bank and account number correctly", () => {
    const res1 = parseBankAccount("กสิกรไทย 1234567890");
    expect(res1.bank).toBe("กสิกรไทย");
    expect(res1.accountNumber).toBe("1234567890");

    const res2 = parseBankAccount("ไทยพาณิชย์ 987654321012");
    expect(res2.bank).toBe("ไทยพาณิชย์");
    expect(res2.accountNumber).toBe("987654321012");

    const res3 = parseBankAccount("0544571123");
    expect(res3.bank).toBe("");
    expect(res3.accountNumber).toBe("0544571123");

    const res4 = parseBankAccount("");
    expect(res4.bank).toBe("");
    expect(res4.accountNumber).toBe("");
  });

  test("formatBankAccount formats combined string", () => {
    expect(formatBankAccount("กสิกรไทย", "1234567890")).toBe("กสิกรไทย 1234567890");
    expect(formatBankAccount("", "1234567890")).toBe("1234567890");
    expect(formatBankAccount("ไทยพาณิชย์", "")).toBe("ไทยพาณิชย์");
    expect(formatBankAccount("", "")).toBe("");
  });

  test("validateBankAccount checks length and required rules", () => {
    // Both empty, optional -> valid
    expect(validateBankAccount("", "", { required: false })).toBeNull();

    // Both empty, required -> error
    expect(validateBankAccount("", "", { required: true })).not.toBeNull();

    // Bank missing
    expect(validateBankAccount("", "1234567890")).toBe("กรุณาเลือกธนาคาร");

    // Account missing
    expect(validateBankAccount("กสิกรไทย", "")).toBe("กรุณากรอกเลขบัญชีธนาคาร");

    // Too short (< 10)
    expect(validateBankAccount("กสิกรไทย", "123456789")).toBe(
      "เลขบัญชีธนาคารต้องเป็นตัวเลข 10 ถึง 15 หลักเท่านั้น",
    );

    // Valid (10 to 15 digits)
    expect(validateBankAccount("กสิกรไทย", "1234567890")).toBeNull();
    expect(validateBankAccount("กสิกรไทย", "123456789012345")).toBeNull();
  });
});

describe("BankAccountInput component", () => {
  test("renders dropdown and handles bank selection and account input", () => {
    const onBankChange = jest.fn();
    const onAccountNumberChange = jest.fn();

    render(
      <BankAccountInput
        bank=""
        accountNumber=""
        onBankChange={onBankChange}
        onAccountNumberChange={onAccountNumberChange}
        required
      />,
    );

    // Click bank dropdown button
    const dropdownBtn = screen.getByRole("button", { name: /ธนาคาร/i });
    fireEvent.click(dropdownBtn);

    // Check all 6 banks exist in listbox
    for (const b of BANK_OPTIONS) {
      expect(screen.getByText(b)).toBeInTheDocument();
    }

    // Select กสิกรไทย
    fireEvent.click(screen.getByText("กสิกรไทย"));
    expect(onBankChange).toHaveBeenCalledWith("กสิกรไทย");

    // Type non-digits in account number input -> only digits are forwarded
    const accountInput = screen.getByLabelText(/เลขที่บัญชี/i);
    fireEvent.change(accountInput, { target: { value: "abc 123-456-7890 xyz" } });
    expect(onAccountNumberChange).toHaveBeenCalledWith("1234567890");
  });
});
