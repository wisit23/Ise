import { getFileTypeConfig } from "./fileIcons";

describe("getFileTypeConfig", () => {
  it("identifies PDF files with rose/red theme", () => {
    const config = getFileTypeConfig("document.pdf", "application/pdf");
    expect(config.ext).toBe("PDF");
    expect(config.icon).toBe("picture_as_pdf");
    expect(config.gradient).toContain("from-rose-500");
  });

  it("identifies Word and text documents with blue theme", () => {
    const docConfig = getFileTypeConfig(
      "notes.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(docConfig.ext).toBe("DOCX");
    expect(docConfig.icon).toBe("article");
    expect(docConfig.gradient).toContain("from-blue-500");

    const txtConfig = getFileTypeConfig("readme.txt", "text/plain");
    expect(txtConfig.ext).toBe("TXT");
  });

  it("identifies Spreadsheets with emerald theme", () => {
    const xlsConfig = getFileTypeConfig("budget.xlsx");
    expect(xlsConfig.ext).toBe("XLSX");
    expect(xlsConfig.icon).toBe("table_chart");
    expect(xlsConfig.gradient).toContain("from-emerald-500");

    const csvConfig = getFileTypeConfig("data.csv");
    expect(csvConfig.ext).toBe("CSV");
  });

  it("identifies Presentations with amber theme", () => {
    const pptConfig = getFileTypeConfig("deck.pptx");
    expect(pptConfig.ext).toBe("PPTX");
    expect(pptConfig.icon).toBe("slideshow");
    expect(pptConfig.gradient).toContain("from-amber-500");
  });

  it("identifies Archives with purple theme", () => {
    const zipConfig = getFileTypeConfig("archive.zip");
    expect(zipConfig.ext).toBe("ZIP");
    expect(zipConfig.icon).toBe("folder_zip");
    expect(zipConfig.gradient).toContain("from-purple-500");
  });

  it("identifies Videos with violet theme", () => {
    const videoConfig = getFileTypeConfig("clip.mp4", "video/mp4");
    expect(videoConfig.ext).toBe("MP4");
    expect(videoConfig.icon).toBe("movie");
    expect(videoConfig.gradient).toContain("from-violet-500");
  });

  it("identifies Audio files with pink theme", () => {
    const audioConfig = getFileTypeConfig("song.mp3", "audio/mpeg");
    expect(audioConfig.ext).toBe("MP3");
    expect(audioConfig.icon).toBe("audio_file");
    expect(audioConfig.gradient).toContain("from-pink-500");
  });

  it("identifies Images with teal theme", () => {
    const imgConfig = getFileTypeConfig("photo.png", "image/png");
    expect(imgConfig.ext).toBe("PNG");
    expect(imgConfig.icon).toBe("image");
    expect(imgConfig.gradient).toContain("from-teal-500");
  });

  it("provides fallback for unknown extensions", () => {
    const unknownConfig = getFileTypeConfig("data.xyz");
    expect(unknownConfig.ext).toBe("XYZ");
    expect(unknownConfig.icon).toBe("description");
    expect(unknownConfig.gradient).toContain("from-slate-500");

    const emptyConfig = getFileTypeConfig("");
    expect(emptyConfig.ext).toBe("FILE");
  });
});
