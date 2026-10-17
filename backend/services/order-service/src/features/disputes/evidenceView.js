const INCLUDE = { files: { orderBy: { id: "asc" } } };

function view(row) {
  if (!row) return null;
  const { files, ...record } = row;
  // The existing API represents one upload per dispute-evidence record. File
  // references now live in the ER's evidence table, not a duplicated column.
  const evidencePath = files?.[0]?.refPath ?? row.evidencePath;
  return {
    ...record,
    evidencePath,
    disputeId: row.disputeCaseId,
    storageKey: evidencePath,
  };
}

module.exports = { INCLUDE, view };
