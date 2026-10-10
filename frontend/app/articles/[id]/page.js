"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import NavBar from "../../../components/NavBar";
import Footer from "../../../components/Footer";
import Button from "../../../components/ui/Button";
import Skeleton from "../../../components/ui/Skeleton";
import ErrorState from "../../../components/ui/ErrorState";
import { apiFetch, mediaUrl } from "../../../lib/api";

const CATEGORY_MAP = {
  care: { label: "การดูแลเสื้อผ้า", color: "bg-blue-50 text-blue-700 border-blue-200" },
  styling: { label: "เคล็ดลับการแต่งตัว", color: "bg-purple-50 text-purple-700 border-purple-200" },
  sustainability: { label: "แฟชั่นยั่งยืน", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  general: { label: "สาระน่ารู้", color: "bg-amber-50 text-amber-700 border-amber-200" },
};

function formatThaiDate(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  return d.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function estimateReadingTime(text) {
  if (!text) return "2 นาที";
  const words = text.trim().length;
  const minutes = Math.max(1, Math.ceil(words / 400));
  return `${minutes} นาที`;
}

/**
 * Lightweight Markdown / Plain Text Renderer for article body
 */
function ArticleContentRenderer({ content }) {
  if (!content) return null;

  const lines = content.split("\n");
  const elements = [];
  let paragraphBuffer = [];

  function flushParagraph(key) {
    if (paragraphBuffer.length > 0) {
      const text = paragraphBuffer.join(" ");
      // Bold parser **bold**
      const parts = text.split(/(\*\*[^*]+\*\*)/g);
      elements.push(
        <p key={key} className="text-slate-700 leading-relaxed text-base mb-5">
          {parts.map((part, i) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <strong key={i} className="font-bold text-slate-900">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            return part;
          })}
        </p>
      );
      paragraphBuffer = [];
    }
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph(`p-${index}`);
      return;
    }

    if (trimmed.startsWith("### ")) {
      flushParagraph(`before-h3-${index}`);
      elements.push(
        <h3
          key={`h3-${index}`}
          className="text-xl sm:text-2xl font-bold text-slate-900 mt-8 mb-3 tracking-tight flex items-center gap-2"
        >
          {trimmed.slice(4)}
        </h3>
      );
    } else if (trimmed.startsWith("## ")) {
      flushParagraph(`before-h2-${index}`);
      elements.push(
        <h2
          key={`h2-${index}`}
          className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-10 mb-4 tracking-tight"
        >
          {trimmed.slice(3)}
        </h2>
      );
    } else if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
      flushParagraph(`before-li-${index}`);
      const liText = trimmed.slice(2);
      const parts = liText.split(/(\*\*[^*]+\*\*)/g);
      elements.push(
        <li key={`li-${index}`} className="ml-5 list-disc text-slate-700 leading-relaxed mb-2">
          {parts.map((part, i) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <strong key={i} className="font-bold text-slate-900">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            return part;
          })}
        </li>
      );
    } else if (trimmed.startsWith("![")) {
      flushParagraph(`before-img-${index}`);
      // Markdown image match ![alt](url)
      const match = trimmed.match(/!\[(.*?)\]\((.*?)\)/);
      if (match) {
        elements.push(
          <figure key={`img-${index}`} className="my-8 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
            <img src={mediaUrl(match[2])} alt={match[1]} className="w-full max-h-[480px] object-cover" />
            {match[1] && (
              <figcaption className="p-3 text-center text-xs text-slate-500 bg-slate-50">
                {match[1]}
              </figcaption>
            )}
          </figure>
        );
      }
    } else {
      paragraphBuffer.push(trimmed);
    }
  });

  flushParagraph("p-final");

  return <div className="article-prose prose-slate max-w-none">{elements}</div>;
}

export default function ArticleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { id } = params;

  const [article, setArticle] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;

    async function loadArticle() {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch(`/api/products/articles/${id}`);
        setArticle(data.article);

        // Fetch related articles from same category
        if (data.article?.category) {
          apiFetch(`/api/products/articles?category=${data.article.category}&limit=4`)
            .then((res) => {
              const others = (res.items || []).filter((a) => a.id !== id).slice(0, 3);
              setRelated(others);
            })
            .catch(() => {});
        }
      } catch (err) {
        console.error("Failed to load article detail:", err);
        setError(err.message || "ไม่พบบทความที่ต้องการ");
      } finally {
        setLoading(false);
      }
    }

    loadArticle();
  }, [id]);

  function handleShare() {
    if (typeof window !== "undefined") {
      navigator.clipboard?.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col bg-slate-50">
        <NavBar />
        <div className="mx-auto max-w-3xl w-full px-4 py-12">
          <Skeleton className="h-6 w-32 mb-6" />
          <Skeleton className="h-12 w-full mb-4" />
          <Skeleton className="h-6 w-60 mb-8" />
          <Skeleton className="h-72 w-full rounded-2xl mb-8" />
          <Skeleton className="h-4 w-full mb-3" />
          <Skeleton className="h-4 w-5/6 mb-3" />
          <Skeleton className="h-4 w-4/6 mb-3" />
        </div>
      </main>
    );
  }

  if (error || !article) {
    return (
      <main className="min-h-screen flex flex-col bg-slate-50">
        <NavBar />
        <div className="mx-auto max-w-3xl w-full px-4 py-16">
          <ErrorState
            message={error || "ไม่พบบทความนี้"}
            onRetry={() => router.push("/articles")}
          />
        </div>
      </main>
    );
  }

  const catInfo = CATEGORY_MAP[article.category] || {
    label: article.category || "บทความ",
    color: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <main className="min-h-screen flex flex-col bg-slate-50/60">
      <NavBar />

      <article className="mx-auto w-full max-w-3xl px-4 py-8 flex-1">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-6">
          <Link href="/" className="hover:text-slate-900 transition-colors">
            หน้าแรก
          </Link>
          <span className="text-slate-300">/</span>
          <Link href="/articles" className="hover:text-slate-900 transition-colors">
            บทความ
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 font-medium truncate max-w-[200px] sm:max-w-xs">
            {catInfo.label}
          </span>
        </nav>

        {/* Header Information */}
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${catInfo.color}`}
            >
              {catInfo.label}
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">
              อ่าน {estimateReadingTime(article.content)}
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight mb-4">
            {article.title}
          </h1>

          {article.summary && (
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed mb-6 font-normal">
              {article.summary}
            </p>
          )}

          {/* Author & Share bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 py-4 border-y border-slate-200/80">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm">
                RL
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  {article.authorName || "ฝ่ายการตลาด RE-LOOP"}
                  <span className="material-symbols-outlined text-[16px] text-emerald-600">
                    verified
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  เผยแพร่เมื่อ {formatThaiDate(article.publishedAt || article.createdAt)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleShare}
                icon={copied ? "check" : "share"}
              >
                {copied ? "คัดลอกลิงก์แล้ว!" : "แชร์"}
              </Button>
            </div>
          </div>
        </header>

        {/* Cover Image */}
        {article.coverImage && (
          <div className="mb-10 overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm bg-slate-100">
            <img
              src={mediaUrl(article.coverImage)}
              alt={article.title}
              className="w-full max-h-[480px] object-cover"
            />
          </div>
        )}

        {/* Article Main Content Body */}
        <div className="bg-white rounded-2xl p-6 sm:p-10 border border-slate-200/80 shadow-sm mb-12">
          <ArticleContentRenderer content={article.content} />
        </div>

        {/* Author Bio Box */}
        <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-r from-emerald-50/70 to-teal-50/40 p-6 mb-12 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white font-bold">
            <span className="material-symbols-outlined text-[24px]">campaign</span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">
              {article.authorName || "ฝ่ายการตลาด RE-LOOP"}
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              มุ่งมั่นส่งเสริมวัฒนธรรมการแต่งตัวอย่างยั่งยืน และสนับสนุนคอมมูนิตี้แฟชั่นหมุนเวียน (Circular Fashion) 
              เพื่อให้ทุกคนสนุกกับการแต่งตัวพร้อมร่วมดูแลสิ่งแวดล้อม
            </p>
          </div>
        </div>

        {/* Related Articles */}
        {related.length > 0 && (
          <section className="border-t border-slate-200/80 pt-10">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-brand-600">auto_stories</span>
              บทความที่คุณอาจสนใจ
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {related.map((item) => (
                <Link
                  key={item.id}
                  href={`/articles/${item.id}`}
                  className="group rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  <div className="aspect-[16/10] w-full bg-slate-100 rounded-lg overflow-hidden mb-2.5">
                    {item.coverImage ? (
                      <img
                        src={mediaUrl(item.coverImage)}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <span className="material-symbols-outlined">menu_book</span>
                      </div>
                    )}
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-brand-600 line-clamp-2 leading-snug">
                    {item.title}
                  </h4>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>

      <Footer />
    </main>
  );
}
