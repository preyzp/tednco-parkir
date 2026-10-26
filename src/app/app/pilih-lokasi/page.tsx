import { Suspense } from "react";
import type { Metadata } from "next";
import { WorkspaceFrame } from "../../../components/workspace/workspace-frame";
import { WorkspaceLoading } from "../../../components/workspace/workspace-status";
import { WorkspacePicker } from "../../../components/workspace/workspace-content";
export const metadata: Metadata = { title: "Pilih Lokasi — TednCo Parkir" };

export default function SelectLocationPage() {
  return <WorkspaceFrame><Suspense fallback={<WorkspaceLoading />}><WorkspacePicker /></Suspense></WorkspaceFrame>;
}
