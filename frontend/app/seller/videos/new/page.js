"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UploadVideoPage() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingProducts, setFetchingProducts] = useState(true);
  const [error, setError] = useState("");

  // เปลี่ยนจากพอร์ต 5000 เป็นพอร์ต Gateway (8080)
  useEffect(() => {
    async function fetchMyProducts() {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("http://localhost:8080/api/products/mine", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("ไม่สามารถดึงรายการสินค้าได้");
        const data = await res.json();
        setProducts(data.items || []);
        if (data.items && data.items.length > 0) {
          setProductId(data.items[0].id);
        }
      } catch (err) {
        console.error(err);
        setError("โหลดรายการสินค้าไม่สำเร็จ กรุณาล็อกอินใหม่");
      } finally {
        setFetchingProducts(false);
      }
    }
    fetchMyProducts();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!productId) {
      setError("กรุณาเลือกสินค้า");
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      // เปลี่ยนจากพอร์ต 5000 เป็นพอร์ต Gateway (8080)
      const res = await fetch("http://localhost:8080/api/products/videos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          videoUrl,
          description,
          productId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to upload video");
      }

      router.push("/swipe");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-10 p-6 bg-white rounded-xl shadow-md">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">อัปโหลดคลิปรีวิวสินค้า</h1>
      {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            เลือกสินค้าของคุณ
          </label>
          {fetchingProducts ? (
            <p className="text-sm text-gray-500">กำลังโหลดรายการสินค้า...</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-red-500">คุณยังไม่มีสินค้าในร้าน กรุณาลงขายสินค้าก่อนอัปโหลดคลิป</p>
          ) : (
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-800"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} (ราคา {p.price} บาท)
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ลิงก์ URL คลิปวิดีโอ
          </label>
          <input
            type="url"
            required
            placeholder="https://example.com/video.mp4"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            รายละเอียดรีวิว
          </label>
          <textarea
            rows="3"
            placeholder="เขียนอธิบายสินค้าหรือรีวิวสั้นๆ..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading || products.length === 0}
          className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition disabled:bg-gray-400"
        >
          {loading ? "กำลังบันทึก..." : "เผยแพร่คลิปรีวิว"}
        </button>
      </form>
    </div>
  );
}