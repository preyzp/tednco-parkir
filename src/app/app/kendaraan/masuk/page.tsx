import { Suspense } from "react";
import type { Metadata } from "next";
import { WorkspaceFrame } from "../../../../components/workspace/workspace-frame";
import { WorkspaceLoading } from "../../../../components/workspace/workspace-status";
import { OwnerAppFrame } from "../../../../components/workspace/workspace-content";
import { VehicleEntryContent } from "../../../../components/vehicles/vehicle-entry-content";
export const metadata: Metadata = { title: "Kendaraan Masuk — TednCo Parkir" };

export default function VehicleEntryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<WorkspaceFrame><WorkspaceLoading /></WorkspaceFrame>}><OwnerAppFrame section="kendaraan"><VehicleEntryContent searchParams={searchParams} /></OwnerAppFrame></Suspense>;
}
