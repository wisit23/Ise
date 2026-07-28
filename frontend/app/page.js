import NavBar from "../components/NavBar";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <NavBar />
      <section className="mx-auto max-w-5xl px-4 py-24 text-center">
        <h1 className="text-4xl font-bold text-gray-900">
          RE-LOOP — แพลตฟอร์มซื้อ-ขายแฟชั่นมือสอง
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          ค้นหาเสื้อผ้ามือสองที่ตรงสไตล์คุณ
          ซื้อขายอย่างปลอดภัยด้วยระบบชำระเงินคนกลาง
        </p>
      </section>
    </main>
  );
}
