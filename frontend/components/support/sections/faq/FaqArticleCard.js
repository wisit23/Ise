import Button from "../../../ui/Button";

export default function FaqArticleCard({
  article,
  publishing,
  onPublish,
  onEdit,
  onDelete,
}) {
  const published = article.status === "PUBLISHED";
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs text-emerald-700">
            {article.categoryLabel || article.category}
          </span>
          <h2 className="font-medium text-gray-900">{article.title}</h2>
          <p className="mt-1 line-clamp-2 text-sm text-gray-500">
            {article.body}
          </p>
          {published && article.hasUnpublishedChanges && (
            <p className="mt-1 text-xs text-amber-700">
              มีการแก้ไขที่ยังไม่เผยแพร่
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${published ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
        >
          {published ? "เผยแพร่แล้ว" : "ฉบับร่าง"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={publishing}
          onClick={() => onEdit(article)}
        >
          แก้ไข
        </Button>
        <Button
          variant="danger"
          disabled={publishing}
          onClick={() => onDelete(article)}
        >
          ลบ
        </Button>
        {(!published || article.hasUnpublishedChanges) && (
          <Button
            type="button"
            variant="secondary"
            disabled={publishing}
            onClick={() => onPublish(article.id)}
          >
            {publishing ? "กำลังเผยแพร่..." : "เผยแพร่บทความนี้"}
          </Button>
        )}
      </div>
    </li>
  );
}
