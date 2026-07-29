'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import NavBar from '../../components/NavBar'; 
import { apiFetch } from '../../lib/api';

export default function SwipeFeed() {
  const containerRef = useRef(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ดึงข้อมูลวิดีโอจาก Backend API จริง
  useEffect(() => {
    async function fetchVideos() {
      try {
        setLoading(true);
        const data = await apiFetch('/api/products/videos/feed');
        setVideos(data.videos || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchVideos();
  }, []);

  const handleScroll = (direction) => {
    if (containerRef.current) {
      const height = containerRef.current.clientHeight;
      containerRef.current.scrollBy({
        top: direction === 'up' ? -height : height,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="bg-[#FFFFFF] h-screen flex flex-col overflow-hidden">
      
      {/* NavBar */}
      <div className="w-full bg-white z-50 shrink-0 shadow-sm">
        <NavBar />
      </div>

      {/* พื้นที่สำหรับ Layout */}
      <div className="flex-1 w-full overflow-hidden flex justify-center items-center relative">
        
        {loading ? (
          <div className="text-white text-lg animate-pulse">กำลังโหลดวิดีโอรีวิว...</div>
        ) : error ? (
          <div className="text-red-500 text-lg">เกิดข้อผิดพลาดในการโหลดข้อมูล: {error}</div>
        ) : videos.length === 0 ? (
          <div className="text-center text-gray-400">
            <p className="text-xl font-semibold mb-2">ยังไม่มีวิดีโอรีวิวในระบบ</p>
            <p className="text-sm">ผู้ขายสามารถลงคลิปรีวิวสินค้าได้จากระบบจัดการร้านค้า</p>
          </div>
        ) : (
          <>
            {/* 1. กล่องวิดีโอ (เลื่อนได้) */}
            <div 
              ref={containerRef}
              className="relative w-full max-w-[900px] h-[80vh] max-h-[750px] bg-black rounded-2xl overflow-y-scroll snap-y snap-mandatory scroll-smooth shadow-2xl border border-zinc-800"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <style jsx>{`
                div::-webkit-scrollbar { display: none; }
              `}</style>

              {videos.map((vid) => (
                <div key={vid.id} className="relative w-full h-full snap-start shrink-0 flex justify-center items-center">
                  
                  {/* วิดีโอ */}
                  <video
                    src={vid.videoUrl}
                    className="w-full h-full object-contain"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />

                  {/* ข้อมูลรีวิวซ้อนทับวิดีโอ */}
                  <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center font-bold text-white">
                        {vid.sellerName ? vid.sellerName.charAt(0) : "R"}
                      </div>
                      <h3 className="font-bold text-lg text-white">
                        @{vid.sellerName || "Reloop Store"}
                      </h3>
                    </div>
                    <p className="text-sm mb-4 line-clamp-2 text-gray-200">{vid.description}</p>
                    
                    {vid.product && (
                      <Link href={`/products/${vid.productId}`}>
                        <button className="px-6 py-2.5 bg-[#00c985] hover:bg-[#00a870] text-white font-bold rounded-lg transition shadow-md">
                          🛒 ดูรายละเอียดสินค้า ({vid.product.name || 'ดูสินค้า'})
                        </button>
                      </Link>
                    )}
                  </div>

                </div>
              ))}
            </div>

            {/* 2. โซนปุ่มกดด้านขวา */}
            <div className="absolute right-8 md:right-16 lg:right-32 top-1/2 transform -translate-y-1/2 flex flex-col gap-4 z-40">
              <button 
                onClick={() => handleScroll('up')}
                className="w-14 h-14 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full flex items-center justify-center transition shadow-lg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-7 h-7">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                </svg>
              </button>

              <button 
                onClick={() => handleScroll('down')}
                className="w-14 h-14 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full flex items-center justify-center transition shadow-lg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-7 h-7">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}