/**
 * Helper to get distinct color gradients, badges, and icons by file extension/MIME.
 * Provides clear visual differentiation for PDFs, Docs, Spreadsheets, Slides, Archives, Videos, Audios, etc.
 */
export function getFileTypeConfig(filename = "", mimeType = "") {
  const cleanName = filename || "";
  const parts = cleanName.split(".");
  const ext = (parts.length > 1 ? parts.pop() : "").toLowerCase();

  // PDF
  if (ext === "pdf" || mimeType.includes("pdf")) {
    return {
      ext: "PDF",
      label: "PDF",
      icon: "picture_as_pdf",
      gradient: "from-rose-500 to-red-600",
      pillBg: "bg-rose-100",
      pillText: "text-rose-700",
      border: "border-rose-200",
    };
  }

  // Word / Text Documents
  if (
    ["doc", "docx", "txt", "rtf", "odt", "pages"].includes(ext) ||
    mimeType.includes("word") ||
    mimeType.includes("text/plain")
  ) {
    return {
      ext: ext ? ext.toUpperCase() : "DOC",
      label: "เอกสาร",
      icon: "article",
      gradient: "from-blue-500 to-indigo-600",
      pillBg: "bg-blue-100",
      pillText: "text-blue-700",
      border: "border-blue-200",
    };
  }

  // Spreadsheets
  if (
    ["xls", "xlsx", "csv", "numbers", "ods"].includes(ext) ||
    mimeType.includes("sheet") ||
    mimeType.includes("csv") ||
    mimeType.includes("excel")
  ) {
    return {
      ext: ext ? ext.toUpperCase() : "XLS",
      label: "สเปรดชีต",
      icon: "table_chart",
      gradient: "from-emerald-500 to-teal-600",
      pillBg: "bg-emerald-100",
      pillText: "text-emerald-700",
      border: "border-emerald-200",
    };
  }

  // Presentations / Slides
  if (
    ["ppt", "pptx", "key", "odp"].includes(ext) ||
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint")
  ) {
    return {
      ext: ext ? ext.toUpperCase() : "PPT",
      label: "งานนำเสนอ",
      icon: "slideshow",
      gradient: "from-amber-500 to-orange-600",
      pillBg: "bg-amber-100",
      pillText: "text-amber-700",
      border: "border-amber-200",
    };
  }

  // Compressed Archives
  if (
    ["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext) ||
    mimeType.includes("zip") ||
    mimeType.includes("compressed")
  ) {
    return {
      ext: ext ? ext.toUpperCase() : "ZIP",
      label: "ไฟล์บีบอัด",
      icon: "folder_zip",
      gradient: "from-purple-500 to-fuchsia-600",
      pillBg: "bg-purple-100",
      pillText: "text-purple-700",
      border: "border-purple-200",
    };
  }

  // Video
  if (
    ["mp4", "mov", "avi", "mkv", "webm", "flv"].includes(ext) ||
    mimeType.startsWith("video/")
  ) {
    return {
      ext: ext ? ext.toUpperCase() : "VIDEO",
      label: "วิดีโอ",
      icon: "movie",
      gradient: "from-violet-500 to-purple-600",
      pillBg: "bg-violet-100",
      pillText: "text-violet-700",
      border: "border-violet-200",
    };
  }

  // Audio
  if (
    ["mp3", "wav", "m4a", "aac", "flac", "ogg"].includes(ext) ||
    mimeType.startsWith("audio/")
  ) {
    return {
      ext: ext ? ext.toUpperCase() : "AUDIO",
      label: "เสียง",
      icon: "audio_file",
      gradient: "from-pink-500 to-rose-600",
      pillBg: "bg-pink-100",
      pillText: "text-pink-700",
      border: "border-pink-200",
    };
  }

  // Images
  if (
    ["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp"].includes(ext) ||
    mimeType.startsWith("image/")
  ) {
    return {
      ext: ext ? ext.toUpperCase() : "IMG",
      label: "รูปภาพ",
      icon: "image",
      gradient: "from-teal-500 to-emerald-600",
      pillBg: "bg-teal-100",
      pillText: "text-teal-700",
      border: "border-teal-200",
    };
  }

  // Fallback generic file
  return {
    ext: ext ? ext.toUpperCase() : "FILE",
    label: "ไฟล์",
    icon: "description",
    gradient: "from-slate-500 to-gray-600",
    pillBg: "bg-slate-100",
    pillText: "text-slate-700",
    border: "border-slate-200",
  };
}
