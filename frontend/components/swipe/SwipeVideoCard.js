"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getAccessToken } from "../../lib/auth";
import { apiFetch, mediaUrl } from "../../lib/api";
import Button from "../ui/Button";

export default function SwipeVideoCard({ video, isActive }) {
  const videoRef = useRef(null);
  const clickTimerRef = useRef(null);
  const playIconTimerRef = useRef(null);
  const heartTimerRef = useRef(null);
  const shareTimerRef = useRef(null);
  const isMutedRef = useRef(true);
  const isMountedRef = useRef(true);
  const playGenerationRef = useRef(0);
  const shareSeqRef = useRef(0);
  const commentTriggerRef = useRef(null);
  const dialogRef = useRef(null);
  const prevCommentOpenRef = useRef(false);

  const [chosen, setChosen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [isFollowed, setIsFollowed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const [shareStatus, setShareStatus] = useState("idle"); // "idle" | "success" | "error"
  const [heartAnim, setHeartAnim] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);

  // Synchronize muted state to video element without affecting play/pause or resetting position
  useEffect(() => {
    isMutedRef.current = isMuted;
    const el = videoRef.current;
    if (el) {
      el.muted = isMuted;
    }
  }, [isMuted]);

  // Restore liked and followed states from storage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedLikes = JSON.parse(
        localStorage.getItem("reloop_liked_videos") || "[]",
      );
      if (storedLikes.includes(video.id)) {
        setChosen(true);
      }
      if (video.sellerId) {
        const storedFollows = JSON.parse(
          localStorage.getItem("reloop_followed_sellers") || "[]",
        );
        if (storedFollows.includes(video.sellerId)) {
          setIsFollowed(true);
        }
      }
    } catch {
      // Safe fallback
    }
  }, [video.id, video.sellerId]);

  // Synchronize followed state across clips from the same seller
  useEffect(() => {
    if (typeof window === "undefined" || !video.sellerId) return undefined;

    function handleFollowChange(e) {
      if (e?.detail?.sellerId === video.sellerId) {
        setIsFollowed(Boolean(e.detail.isFollowed));
      }
    }

    window.addEventListener("reloop:follow-change", handleFollowChange);
    return () => {
      window.removeEventListener("reloop:follow-change", handleFollowChange);
    };
  }, [video.sellerId]);

  // Active transition lifecycle controls play/pause and reset
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const currentGen = ++playGenerationRef.current;

    if (isActive) {
      el.currentTime = 0;
      el.muted = isMutedRef.current;
      const playPromise = el.play();
      if (playPromise !== undefined && typeof playPromise.then === "function") {
        playPromise
          .then(() => {
            if (
              isMountedRef.current &&
              playGenerationRef.current === currentGen
            ) {
              setIsPlaying(true);
            }
          })
          .catch(() => {
            // Autoplay policy fallback
            if (
              isMountedRef.current &&
              playGenerationRef.current === currentGen
            ) {
              setIsPlaying(false);
            }
          });
      }
    } else {
      el.pause();
      setIsPlaying(false);
    }

    return () => {
      playGenerationRef.current += 1;
    };
  }, [isActive]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      playGenerationRef.current += 1;
      shareSeqRef.current += 1;
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      if (playIconTimerRef.current) clearTimeout(playIconTimerRef.current);
      if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
    };
  }, []);

  function handleCloseComment() {
    setCommentOpen(false);
  }

  // Manage focus lifecycle for accessible comment dialog
  useEffect(() => {
    if (commentOpen) {
      prevCommentOpenRef.current = true;
      const el = dialogRef.current;
      if (el) {
        const focusable = el.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          el.focus();
        }
      }
    } else if (prevCommentOpenRef.current) {
      prevCommentOpenRef.current = false;
      commentTriggerRef.current?.focus();
    }
  }, [commentOpen]);

  // Accessible keyboard handling: Tab key trap & Escape to close
  useEffect(() => {
    if (!commentOpen) return undefined;

    function handleDialogKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleCloseComment();
        return;
      }

      if (e.key === "Tab") {
        const el = dialogRef.current;
        if (!el) return;

        const focusable = Array.from(
          el.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (
            document.activeElement === first ||
            !el.contains(document.activeElement)
          ) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (
            document.activeElement === last ||
            !el.contains(document.activeElement)
          ) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    window.addEventListener("keydown", handleDialogKeyDown);
    return () => window.removeEventListener("keydown", handleDialogKeyDown);
  }, [commentOpen]);

  function togglePlayPause() {
    const el = videoRef.current;
    if (!el) return;

    if (isPlaying) {
      playGenerationRef.current += 1;
      el.pause();
      setIsPlaying(false);
    } else {
      const currentGen = ++playGenerationRef.current;
      const playPromise = el.play();
      if (playPromise !== undefined && typeof playPromise.then === "function") {
        playPromise
          .then(() => {
            if (
              isMountedRef.current &&
              playGenerationRef.current === currentGen
            ) {
              setIsPlaying(true);
            }
          })
          .catch(() => {
            if (
              isMountedRef.current &&
              playGenerationRef.current === currentGen
            ) {
              setIsPlaying(false);
            }
          });
      }
    }
    setShowPlayIcon(true);
    if (playIconTimerRef.current) clearTimeout(playIconTimerRef.current);
    playIconTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setShowPlayIcon(false);
      }
    }, 500);
  }

  function triggerHeartLike() {
    setHeartAnim(true);
    if (heartTimerRef.current) clearTimeout(heartTimerRef.current);
    heartTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setHeartAnim(false);
      }
    }, 700);
    if (!chosen) {
      handleChoose();
    }
  }

  // Separate single tap (play/pause) from double tap (like)
  function handleVideoClick() {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      triggerHeartLike();
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        if (isMountedRef.current) {
          togglePlayPause();
        }
      }, 260);
    }
  }

  function handleVideoKeyDown(e) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      togglePlayPause();
    }
  }

  function toggleMute(e) {
    if (e) e.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    const nextMuted = !el.muted;
    el.muted = nextMuted;
    setIsMuted(nextMuted);
  }

  function handleToggleFollow(e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!video.sellerId) return;

    if (!getAccessToken()) {
      window.location.href = "/login";
      return;
    }

    const nextFollowed = !isFollowed;
    setIsFollowed(nextFollowed);

    try {
      const storedFollows = JSON.parse(
        localStorage.getItem("reloop_followed_sellers") || "[]",
      );
      let updated;
      if (nextFollowed) {
        updated = Array.from(new Set([...storedFollows, video.sellerId]));
      } else {
        updated = storedFollows.filter((id) => id !== video.sellerId);
      }
      localStorage.setItem("reloop_followed_sellers", JSON.stringify(updated));

      window.dispatchEvent(
        new CustomEvent("reloop:follow-change", {
          detail: { sellerId: video.sellerId, isFollowed: nextFollowed },
        }),
      );
    } catch {
      // Safe fallback
    }
  }

  async function handleChoose(e) {
    if (e) e.stopPropagation();
    if (choosing) return;
    if (!getAccessToken()) {
      window.location.href = "/login";
      return;
    }

    setChoosing(true);
    const nextChosen = !chosen;

    try {
      if (nextChosen) {
        await apiFetch(`/api/products/videos/${video.id}/choose`, {
          method: "POST",
        });
      } else {
        await apiFetch(`/api/products/videos/${video.id}/choose`, {
          method: "DELETE",
        });
      }

      if (isMountedRef.current) {
        setChosen(nextChosen);
      }

      try {
        const storedLikes = JSON.parse(
          localStorage.getItem("reloop_liked_videos") || "[]",
        );
        let updated;
        if (nextChosen) {
          updated = Array.from(new Set([...storedLikes, video.id]));
        } else {
          updated = storedLikes.filter((id) => id !== video.id);
        }
        localStorage.setItem("reloop_liked_videos", JSON.stringify(updated));
      } catch {
        // Safe fallback
      }
    } catch {
      // Swallow error allowing retry
    } finally {
      if (isMountedRef.current) {
        setChoosing(false);
      }
    }
  }

  async function handleShare(e) {
    if (e) e.stopPropagation();

    const origin =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "";
    const shareUrl = `${origin}/swipe?video=${encodeURIComponent(video.id)}`;

    if (shareTimerRef.current) {
      clearTimeout(shareTimerRef.current);
      shareTimerRef.current = null;
    }

    const currentReq = ++shareSeqRef.current;

    if (!navigator?.clipboard?.writeText) {
      if (!isMountedRef.current || shareSeqRef.current !== currentReq) return;
      setShareStatus("error");
      shareTimerRef.current = setTimeout(() => {
        if (isMountedRef.current && shareSeqRef.current === currentReq) {
          setShareStatus("idle");
        }
      }, 2500);
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      if (!isMountedRef.current || shareSeqRef.current !== currentReq) return;
      setShareStatus("success");
      shareTimerRef.current = setTimeout(() => {
        if (isMountedRef.current && shareSeqRef.current === currentReq) {
          setShareStatus("idle");
        }
      }, 2000);
    } catch {
      if (!isMountedRef.current || shareSeqRef.current !== currentReq) return;
      setShareStatus("error");
      shareTimerRef.current = setTimeout(() => {
        if (isMountedRef.current && shareSeqRef.current === currentReq) {
          setShareStatus("idle");
        }
      }, 2500);
    }
  }

  const sellerName = video.sellerName || "Reloop Store";
  const initial = sellerName.charAt(0).toUpperCase();

  const productThumbnail =
    (Array.isArray(video.product?.images) && video.product.images[0]) ||
    (Array.isArray(video.product?.photos) && video.product.photos[0]?.url) ||
    (Array.isArray(video.product?.media) &&
      video.product.media.find((m) => m.type === "image")?.url) ||
    video.thumbnail ||
    null;

  return (
    <article className="relative isolate flex h-full min-h-full w-full shrink-0 snap-start snap-always items-center justify-center overflow-hidden bg-black select-none outline-none focus:outline-none [-webkit-tap-highlight-color:transparent]">
      {/* Center Stage Container: holds the centered vertical video frame and action rail */}
      <div className="relative flex h-full sm:h-[min(calc(100dvh-1.5rem),960px)] w-full items-center justify-center">
        {/* 9:16 Vertical Video Frame */}
        <div className="relative h-full w-full sm:w-auto sm:aspect-[9/16] overflow-hidden rounded-none sm:rounded-3xl border-0 sm:border sm:border-zinc-800/80 bg-black shadow-2xl flex items-center justify-center outline-none focus:outline-none select-none [-webkit-tap-highlight-color:transparent]">
          {/* Main Video Stream */}
          <video
            ref={videoRef}
            src={mediaUrl(video.videoUrl)}
            className="h-full w-full object-cover cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 select-none [-webkit-tap-highlight-color:transparent]"
            preload={isActive ? "auto" : "metadata"}
            loop
            playsInline
            muted={isMuted}
            onClick={handleVideoClick}
            onKeyDown={handleVideoKeyDown}
            tabIndex={0}
            role="button"
            aria-pressed={isPlaying}
            aria-label={
              isPlaying
                ? "หยุดเล่นวิดีโอ (ดับเบิลคลิกเพื่อถูกใจ)"
                : "เล่นวิดีโอ (ดับเบิลคลิกเพื่อถูกใจ)"
            }
          />

          {/* Double Tap Heart Burst Animation */}
          {heartAnim && (
            <div
              className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center animate-[ping_700ms_cubic-bezier(0,0,0.2,1)_forwards]"
              aria-hidden="true"
            >
              <svg
                className="h-28 w-28 fill-rose-500 text-rose-500 drop-shadow-[0_0_30px_rgba(244,63,94,0.9)]"
                viewBox="0 0 24 24"
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </div>
          )}

          {/* Center Play/Pause Floating Flash Badge */}
          {showPlayIcon && (
            <div
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center animate-[fade-out_500ms_ease-out_forwards]"
              aria-hidden="true"
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-white shadow-2xl">
                {isPlaying ? (
                  <svg className="h-10 w-10 fill-current" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg
                    className="ml-1 h-10 w-10 fill-current"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </div>
            </div>
          )}

          {/* Sound Control (positioned top corner inside video frame) */}
          <div className="absolute top-[calc(4.75rem+env(safe-area-inset-top,0px))] right-3 sm:top-4 sm:right-4 z-20 flex items-center">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? "เปิดเสียง" : "ปิดเสียง"}
              className="focus-ring flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/80 active:scale-95 shadow-lg border border-white/15"
            >
              {isMuted ? (
                <svg
                  className="h-5 w-5 fill-current"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5 fill-current"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                </svg>
              )}
            </button>
          </div>

          {/* Bottom Content Area: seller info and description */}
          <div
            data-testid="bottom-overlay"
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-16 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-5 px-4 sm:px-5 pointer-events-none z-10"
          >
            <div className="pointer-events-auto space-y-2 max-w-[85%]">
              {/* Product Card / Pill ABOVE Channel Name */}
              {video.product && (
                <Link
                  href={`/products/${video.productId || video.product.id}`}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-black/60 hover:bg-black/80 px-2 py-1 backdrop-blur-md border border-white/15 transition hover:scale-[1.02] active:scale-95 shadow-md w-fit max-w-[210px]"
                >
                  {productThumbnail ? (
                    <img
                      src={mediaUrl(productThumbnail)}
                      alt=""
                      className="h-5 w-5 rounded object-cover shrink-0 border border-white/10"
                    />
                  ) : (
                    <span
                      className="material-symbols-outlined text-[15px] text-brand-400 shrink-0"
                      aria-hidden="true"
                    >
                      shopping_bag
                    </span>
                  )}
                  <span className="truncate text-[11px] font-medium text-white max-w-[85px] sm:max-w-[105px]">
                    {video.product.title || "สินค้าในคลิป"}
                  </span>
                  {video.product.price !== undefined &&
                    video.product.price !== null && (
                      <span className="shrink-0 text-[11px] font-bold text-brand-400">
                        ฿{video.product.price.toLocaleString("th-TH")}
                      </span>
                    )}
                  <svg
                    className="h-3 w-3 shrink-0 text-zinc-400 stroke-current stroke-2 fill-none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              )}

              {/* Seller Name */}
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                  @{sellerName}
                </span>
              </div>

              {/* Description */}
              {video.description && (
                <p className="line-clamp-2 text-xs sm:text-sm text-zinc-200 leading-relaxed drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                  {video.description}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Action Rail: overlaid inside video on mobile (absolute), outside video frame on desktop (sm:relative) */}
        <aside
          aria-label="การทำงานบนวิดีโอ"
          className="absolute right-3 bottom-16 sm:relative sm:right-auto sm:bottom-auto sm:ml-4 xl:sm:ml-5 sm:mb-4 sm:self-end z-20 flex flex-col items-center gap-4 shrink-0"
        >
          {/* 1. Seller Avatar & Follow button */}
          <div className="group relative flex flex-col items-center">
            {video.sellerId ? (
              <Link
                href={`/store/${video.sellerId}`}
                aria-label={`ร้านค้า ${sellerName}`}
                className="focus-ring flex h-12 w-12 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-2 border-brand-400 bg-gradient-to-tr from-brand-600 to-teal-400 font-bold text-white shadow-xl transition hover:scale-105 active:scale-95"
              >
                {initial}
              </Link>
            ) : (
              <div className="flex h-12 w-12 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-2 border-brand-400 bg-gradient-to-tr from-brand-600 to-teal-400 font-bold text-white shadow-xl">
                {initial}
              </div>
            )}
            <button
              type="button"
              onClick={handleToggleFollow}
              aria-label={
                isFollowed ? `เลิกติดตาม ${sellerName}` : `ติดตาม ${sellerName}`
              }
              aria-pressed={isFollowed}
              className={`focus-ring absolute -bottom-1 flex h-[20px] w-[20px] items-center justify-center rounded-full text-white shadow transition-all duration-200 active:scale-90 ${
                isFollowed
                  ? "bg-zinc-700 hover:bg-zinc-600"
                  : "bg-brand-500 hover:bg-brand-600 hover:scale-110"
              }`}
            >
              {isFollowed ? (
                <svg
                  className="h-3 w-3 stroke-current stroke-[3] fill-none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg
                  className="h-3 w-3 stroke-current stroke-[3] fill-none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              )}
            </button>
          </div>

          {/* 2. Like Button */}
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={handleChoose}
              disabled={choosing}
              aria-pressed={chosen}
              aria-label={chosen ? "บันทึกไว้แล้ว" : "สนใจสินค้านี้"}
              className={`focus-ring flex h-12 w-12 min-h-[44px] min-w-[44px] items-center justify-center rounded-full backdrop-blur-md shadow-xl transition-all duration-200 active:scale-90 ${
                chosen
                  ? "bg-rose-600 text-white drop-shadow-[0_4px_12px_rgba(225,29,72,0.6)]"
                  : "bg-zinc-900/80 text-white hover:bg-zinc-800 border border-white/15"
              }`}
            >
              <svg
                className={`h-6 w-6 transition-transform ${chosen ? "scale-110 fill-current" : "fill-none stroke-current stroke-2"}`}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
            </button>
            <span className="text-[11px] font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
              {chosen ? "ถูกใจแล้ว" : "ถูกใจ"}
            </span>
          </div>

          {/* 3. Comment Button */}
          <div className="flex flex-col items-center gap-1">
            <button
              ref={commentTriggerRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCommentOpen(true);
              }}
              aria-label="ความคิดเห็น"
              aria-haspopup="dialog"
              aria-expanded={commentOpen}
              className="focus-ring flex h-12 w-12 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-zinc-900/80 text-white backdrop-blur-md border border-white/15 shadow-xl transition-all hover:bg-zinc-800 active:scale-95"
            >
              <svg
                className="h-5 w-5 fill-current"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
              </svg>
            </button>
            <span className="text-[11px] font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
              ความคิดเห็น
            </span>
          </div>

          {/* 4. Share Button */}
          <div className="flex flex-col items-center gap-1">
            <div role="status" aria-live="polite" className="sr-only">
              {shareStatus === "success"
                ? "คัดลอกลิงก์สำเร็จ"
                : shareStatus === "error"
                  ? "ไม่สามารถคัดลอกลิงก์ได้"
                  : ""}
            </div>
            <button
              type="button"
              onClick={handleShare}
              aria-label={
                shareStatus === "success"
                  ? "คัดลอกลิงก์สำเร็จ"
                  : shareStatus === "error"
                    ? "ไม่สามารถคัดลอกลิงก์ได้"
                    : "แชร์คลิปนี้"
              }
              className="focus-ring flex h-12 w-12 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-zinc-900/80 text-white backdrop-blur-md border border-white/15 shadow-xl transition-all hover:bg-zinc-800 active:scale-95"
            >
              {shareStatus === "success" ? (
                <svg
                  className="h-5 w-5 text-brand-400 fill-current"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                </svg>
              ) : shareStatus === "error" ? (
                <svg
                  className="h-5 w-5 text-rose-400 stroke-current stroke-2 fill-none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5 fill-none stroke-current stroke-2"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
              )}
            </button>
            <span
              className={`text-[11px] font-semibold drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] ${
                shareStatus === "success"
                  ? "text-brand-400"
                  : shareStatus === "error"
                    ? "text-rose-400"
                    : "text-white"
              }`}
            >
              {shareStatus === "success"
                ? "คัดลอกแล้ว!"
                : shareStatus === "error"
                  ? "ล้มเหลว"
                  : "แชร์"}
            </span>
          </div>
        </aside>
      </div>

      {/* Honest Comment Affordance Dialog */}
      {commentOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`comment-title-${video.id}`}
          aria-describedby={`comment-desc-${video.id}`}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
          onClick={handleCloseComment}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            className="relative w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl animate-fade-in-up focus:outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-brand-400"
                  aria-hidden="true"
                >
                  chat_bubble
                </span>
                <h3
                  id={`comment-title-${video.id}`}
                  className="text-base font-bold text-white"
                >
                  ความคิดเห็น
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseComment}
                aria-label="ปิดหน้าต่างความคิดเห็น"
                className="focus-ring flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="my-6 flex flex-col items-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
                <span
                  className="material-symbols-outlined text-2xl"
                  aria-hidden="true"
                >
                  chat_bubble_outline
                </span>
              </div>
              <p className="text-sm font-semibold text-white">
                ยังไม่มีระบบความคิดเห็นบนคลิปวิดีโอ
              </p>
              <p
                id={`comment-desc-${video.id}`}
                className="mt-2 text-xs text-zinc-400 leading-relaxed max-w-xs"
              >
                ระบบคลิปวิดีโอปัจจุบันยังไม่รองรับการแสดงความคิดเห็นโดยตรง
                แต่คุณสามารถอ่านรีวิวจากผู้ซื้อจริงและสอบถามข้อมูลเพิ่มเติมได้ที่หน้ารายละเอียดสินค้า
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {video.productId && (
                <Button
                  href={`/products/${video.productId}`}
                  variant="primary"
                  size="md"
                  className="w-full justify-center"
                >
                  ดูรีวิวและรายละเอียดสินค้า
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={handleCloseComment}
                className="w-full justify-center !border-zinc-700 !bg-zinc-800 !text-white hover:!bg-zinc-700"
              >
                ปิด
              </Button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
