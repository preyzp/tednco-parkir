import { Suspense } from "react";
import type { Metadata } from "next";
import { WorkspaceFrame } from "../../../../components/workspace/workspace-frame";
import { WorkspaceLoading } from "../../../../components/workspace/workspace-status";
import { OwnerAppFrame } from "../../../../components/workspace/workspace-content";
import { LocationSettingsContent, LocationSettingsLoading } from "../../../../components/settings/location-settings-content";
export const metadata: Metadata = { title: "Tarif & Jam Operasional — TednCo Parkir" };

export default function TariffSettingsPage() {
  return (
    <Suspense fallback={<WorkspaceFrame><WorkspaceLoading /></WorkspaceFrame>}>
      <OwnerAppFrame section="pengaturan">
        <Suspense fallback={<LocationSettingsLoading />}><LocationSettingsContent /></Suspense>
      </OwnerAppFrame>
    </Suspense>
  );
}
