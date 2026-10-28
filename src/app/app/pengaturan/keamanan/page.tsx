import { Suspense } from "react";
import type { Metadata } from "next";
import { WorkspaceFrame } from "../../../../components/workspace/workspace-frame";
import { WorkspaceLoading } from "../../../../components/workspace/workspace-status";
import { OwnerAppFrame } from "../../../../components/workspace/workspace-content";
import { SecuritySettingsContent } from "../../../../components/account/security-content";
export const metadata: Metadata = { title: "Keamanan Akun — TednCo Parkir" };

export default function SecuritySettingsPage() {
  return <Suspense fallback={<WorkspaceFrame><WorkspaceLoading /></WorkspaceFrame>}><OwnerAppFrame section="pengaturan"><SecuritySettingsContent /></OwnerAppFrame></Suspense>;
}
