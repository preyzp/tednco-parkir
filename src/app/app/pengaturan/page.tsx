import { Suspense } from "react";
import type { Metadata } from "next";
import { WorkspaceFrame } from "../../../components/workspace/workspace-frame";
import { WorkspaceLoading } from "../../../components/workspace/workspace-status";
import { OwnerAppFrame } from "../../../components/workspace/workspace-content";
import { SettingsHubContent } from "../../../components/settings/settings-hub";
export const metadata: Metadata = { title: "Pengaturan — TednCo Parkir" };

export default function SettingsPage() {
  return <Suspense fallback={<WorkspaceFrame><WorkspaceLoading /></WorkspaceFrame>}><OwnerAppFrame section="pengaturan"><SettingsHubContent /></OwnerAppFrame></Suspense>;
}
