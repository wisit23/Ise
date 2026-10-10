"use client";

import { useState } from "react";
import { StarInput } from "../StarRating";
import ReviewMediaUploader from "../ReviewMediaUploader";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import { apiFetch } from "../../lib/api";
import { getAccessToken } from "../../lib/auth";

export default function OrderReviewForm({ order, onSubmitted }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [media, setMedia] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const review = await apiFetch("/api/reviews", {
        method: "POST",
        token: getAccessToken(),
        body: { orderId: order.id, rating, comment, media },
      });
      onSubmitted(review);
    } catch (err) {
      setError(err.message || "ส่งรีวิวไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-surface-subtle p-4">
        <p className="text-sm font-medium text-gray-700">ให้คะแนนร้านค้า</p>
        <StarInput value={rating} onChange={setRating} size={30} />
      </div>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="เล่าประสบการณ์การซื้อของคุณ (ไม่บังคับ)"
        rows={3}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
      />
      <ReviewMediaUploader
        value={media}
        onChange={setMedia}
        disabled={submitting}
      />
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" loading={submitting} icon="send">
        ส่งรีวิว
      </Button>
    </form>
  );
}
