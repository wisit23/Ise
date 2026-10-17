"use client";

import { useEffect, useRef, useState } from "react";

export const BANK_OPTIONS = [
  "ธนาคารกรุงเทพ",
  "กสิกรไทย",
  "กรุงไทย",
  "ไทยพาณิชย์",
  "ทีเอ็มบีธนชาต",
  "กรุงศรีอยุธยา",
];

/**
 * Parse an existing bankAccount string into { bank, accountNumber }
 */
export function parseBankAccount(value) {
  if (!value || typeof value !== "string") {
    return { bank: "", accountNumber: "" };
  }
  const trimmed = value.trim();

  // 1. Try matching known bank as prefix
  for (const b of BANK_OPTIONS) {
    if (trimmed.startsWith(b)) {
      const rest = trimmed.slice(b.length).replace(/\D/g, "");
      return { bank: b, accountNumber: rest.slice(0, 15) };
    }
  }

  // 2. Try matching known bank anywhere in string
  for (const b of BANK_OPTIONS) {
    if (trimmed.includes(b)) {
      const rest = trimmed.replace(b, "").replace(/\D/g, "");
      return { bank: b, accountNumber: rest.slice(0, 15) };
    }
  }

  // 3. Fallback: treat all digits as accountNumber
  const digits = trimmed.replace(/\D/g, "");
  return { bank: "", accountNumber: digits.slice(0, 15) };
}

/**
 * Format { bank, accountNumber } into unified string for backend storage
 */
export function formatBankAccount(bank, accountNumber) {
  const cleanBank = (bank || "").trim();
  const cleanAcc = (accountNumber || "").replace(/\D/g, "").slice(0, 15);
  if (!cleanBank && !cleanAcc) return "";
  if (!cleanBank) return cleanAcc;
  if (!cleanAcc) return cleanBank;
  return `${cleanBank} ${cleanAcc}`;
}

/**
 * Validates bank selection and account number length (10-15 digits)
 * Returns error string if invalid, or null if valid.
 */
export function validateBankAccount(bank, accountNumber, { required = false } = {}) {
  const cleanBank = (bank || "").trim();
  const cleanAcc = (accountNumber || "").replace(/\D/g, "");

  if (!cleanBank && !cleanAcc) {
    if (required) return "กรุณาเลือกธนาคารและกรอกเลขบัญชี 10-15 หลัก";
    return null;
  }

  if (!cleanBank) {
    return "กรุณาเลือกธนาคาร";
  }

  if (!cleanAcc) {
    return "กรุณากรอกเลขบัญชีธนาคาร";
  }

  if (cleanAcc.length < 10 || cleanAcc.length > 15) {
    return "เลขบัญชีธนาคารต้องเป็นตัวเลข 10 ถึง 15 หลักเท่านั้น";
  }

  return null;
}

/**
 * BankAccountInput component:
 * - Dropdown for Bank selection (styled like shipping company dropdown)
 * - Number-only input for Account Number (10 to 15 digits)
 */
export default function BankAccountInput({
  bank = "",
  accountNumber = "",
  onBankChange,
  onAccountNumberChange,
  disabled = false,
  required = false,
  error = "",
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  // Close dropdown on Escape
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && dropdownOpen) {
        setDropdownOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dropdownOpen]);

  function handleAccountInput(e) {
    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 15);
    onAccountNumberChange?.(digitsOnly);
  }

  const isLengthInvalid = accountNumber && accountNumber.length < 10;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 1. Bank Dropdown */}
        <div className="space-y-1 relative" ref={dropdownRef}>
          <label
            htmlFor="bank-select-button"
            className="block text-xs font-semibold text-slate-700"
          >
            ธนาคาร {required && <span className="text-red-500">*</span>}
          </label>
          <button
            id="bank-select-button"
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
            onClick={() => !disabled && setDropdownOpen((prev) => !prev)}
            className="w-full flex items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs hover:border-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 transition cursor-pointer"
          >
            <span className="flex items-center gap-2 truncate">
              <span className="material-symbols-outlined text-[16px] text-slate-400 shrink-0">
                account_balance
              </span>
              <span
                className={
                  bank
                    ? "text-slate-900 font-medium truncate"
                    : "text-slate-400 truncate"
                }
              >
                {bank || "-- เลือกธนาคาร --"}
              </span>
            </span>
            <span
              className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform duration-200 shrink-0 ${
                dropdownOpen ? "rotate-180 text-emerald-600" : ""
              }`}
            >
              expand_more
            </span>
          </button>

          {/* Scrollable dropdown menu opening downwards matching shipping dropdown */}
          {dropdownOpen && (
            <div
              role="listbox"
              data-testid="bank-dropdown-menu"
              className="absolute left-0 right-0 top-full mt-1.5 z-50 max-h-48 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1 shadow-2xl divide-y divide-slate-100"
            >
              {!required && (
                <div
                  role="option"
                  aria-selected={!bank}
                  onClick={() => {
                    onBankChange?.("");
                    setDropdownOpen(false);
                  }}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs cursor-pointer transition ${
                    !bank
                      ? "bg-emerald-50 text-emerald-700 font-semibold"
                      : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <span>-- เลือกธนาคาร --</span>
                  {!bank && (
                    <span className="material-symbols-outlined text-[16px] text-emerald-600">
                      check
                    </span>
                  )}
                </div>
              )}
              {BANK_OPTIONS.map((name) => {
                const isSelected = bank === name;
                return (
                  <div
                    key={name}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onBankChange?.(name);
                      setDropdownOpen(false);
                    }}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs cursor-pointer transition ${
                      isSelected
                        ? "bg-emerald-50 text-emerald-700 font-semibold"
                        : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-slate-400">
                        account_balance
                      </span>
                      <span>{name}</span>
                    </div>
                    {isSelected && (
                      <span className="material-symbols-outlined text-[16px] text-emerald-600">
                        check
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Account Number Input */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label
              htmlFor="bank-account-number-input"
              className="block text-xs font-semibold text-slate-700"
            >
              เลขที่บัญชี {required && <span className="text-red-500">*</span>}
            </label>
            {accountNumber ? (
              <span
                className={`text-[10px] font-mono ${
                  isLengthInvalid ? "text-amber-600 font-semibold" : "text-slate-400"
                }`}
              >
                {accountNumber.length}/15 หลัก
              </span>
            ) : null}
          </div>
          <div className="relative">
            <input
              id="bank-account-number-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={15}
              disabled={disabled}
              value={accountNumber}
              onChange={handleAccountInput}
              placeholder="ตัวเลข 10-15 หลัก (เช่น 1234567890)"
              className={`w-full rounded-lg border bg-white px-3 py-2 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 transition disabled:bg-slate-100 disabled:text-slate-400 ${
                isLengthInvalid
                  ? "border-amber-400 focus:border-amber-500 focus:ring-amber-500"
                  : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-500"
              }`}
            />
          </div>
          {isLengthInvalid && (
            <p className="text-[11px] text-amber-600">
              * ต้องเป็นตัวเลข 10 ถึง 15 หลัก (ปัจจุบัน {accountNumber.length} หลัก)
            </p>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
