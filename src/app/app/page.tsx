import { Suspense } from "react";
import type { Metadata } from "next";
import { WorkspaceFrame } from "../../components/workspace/workspace-frame";
import { WorkspaceLoading } from "../../components/workspace/workspace-status";
import { WorkspaceHome } from "../../components/workspace/workspace-content";
export const metadata: Metadata = { title: "Ruang Kerja — TednCo Parkir" };

export default function WorkspacePage() {
  return <WorkspaceFrame><Suspense fallback={<WorkspaceLoading />}><WorkspaceHome /></Suspense></WorkspaceFrame>;
}
