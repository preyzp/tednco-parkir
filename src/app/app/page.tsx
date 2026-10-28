import { Suspense } from "react";
import type { Metadata } from "next";
import { WorkspaceFrame } from "../../components/workspace/workspace-frame";
import { WorkspaceLoading } from "../../components/workspace/workspace-status";
import { WorkspaceHome } from "../../components/workspace/workspace-content";
export const metadata: Metadata = { title: "Dashboard — TednCo Parkir" };

// The shell depends on the authorized workspace, so it renders inside Suspense.
export default function WorkspacePage() {
  return <Suspense fallback={<WorkspaceFrame><WorkspaceLoading /></WorkspaceFrame>}><WorkspaceHome /></Suspense>;
}
