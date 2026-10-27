export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export function isVideoFile(file) {
  return file.type?.startsWith("video/") || /\.(mp4|mov)$/i.test(file.name);
}

export async function validateListingVideo(file) {
  if (
    !/\.(mp4|mov)$/i.test(file.name) ||
    (file.type && !/^video\/(mp4|quicktime)$/i.test(file.type))
  ) {
    throw new Error("กรุณาใช้คลิป MP4 หรือ MOV");
  }
  if (file.size > MAX_VIDEO_BYTES)
    throw new Error("คลิปต้องมีขนาดไม่เกิน 100 MB");
  await new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const finish = (error) => {
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error("อ่านข้อมูลคลิปไม่สำเร็จ กรุณาลองใหม่")),
      15000,
    );
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (
        !Number.isFinite(video.duration) ||
        video.duration <= 0 ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0
      ) {
        finish(new Error("ไม่สามารถอ่านความยาวหรือความละเอียดของคลิปได้"));
      } else if (video.duration > 60) {
        finish(new Error("คลิปต้องยาวไม่เกิน 60 วินาที"));
      } else if (video.videoWidth > 1080 || video.videoHeight > 1080) {
        finish(
          new Error("คลิปต้องมีความกว้างและความสูงไม่เกิน 1080 × 1080 พิกเซล"),
        );
      } else finish();
    };
    video.onerror = () =>
      finish(
        new Error("ไม่สามารถอ่านคลิปได้ กรุณาใช้ไฟล์ MP4 หรือ MOV ที่สมบูรณ์"),
      );
    video.src = url;
  });
}
