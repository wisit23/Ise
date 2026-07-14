'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getStoredUser, clearSession } from '../lib/auth';

export default function NavBar() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  function handleLogout() {
    clearSession();
    setUser(null);
    window.location.href = '/';
  }

  return (
    <header className="border-b border-gray-200">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-xl font-bold text-emerald-600">
          RE-LOOP
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <span className="text-gray-600">สวัสดี, {user.firstName}</span>
              <button onClick={handleLogout} className="text-gray-600 hover:text-emerald-600">
                ออกจากระบบ
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-gray-600 hover:text-emerald-600">
                เข้าสู่ระบบ
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
              >
                สมัครสมาชิก
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
