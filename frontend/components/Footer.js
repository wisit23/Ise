export default function Footer() {
  return (
    <footer className="mt-16 border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} RE-LOOP — แพลตฟอร์มซื้อ-ขายแฟชั่นมือสอง
        </p>
        <p className="text-xs text-gray-400">
          เดโมโปรเจกต์เพื่อการศึกษา ไม่มีการชำระเงินจริง
        </p>
      </div>
    </footer>
  );
}
