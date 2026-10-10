"use client";
import CaseWorkspace from "../workspace/CaseWorkspace";
export default function DisputesSection({ status, ...props }) {
  return <CaseWorkspace {...props} statusFilter={status} domain="disputes" />;
}
