export default function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} RE-LOOP — แพลตฟอร์มซื้อ-ขายแฟชั่นมือสอง
        </p>
        <p className="text-ink-subtle text-xs">
          เดโมโปรเจกต์เพื่อการศึกษา ไม่มีการชำระเงินจริง
        </p>
      </div>
    </footer>
  );
}
