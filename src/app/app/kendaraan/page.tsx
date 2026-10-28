import { Suspense } from "react";
import type { Metadata } from "next";
import { WorkspaceFrame } from "../../../components/workspace/workspace-frame";
import { WorkspaceLoading } from "../../../components/workspace/workspace-status";
import { OwnerAppFrame } from "../../../components/workspace/workspace-content";
import { VehicleListContent, VehicleListLoading } from "../../../components/vehicles/vehicle-list-content";
export const metadata: Metadata = { title: "Kendaraan — TednCo Parkir" };

export default function VehiclesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<WorkspaceFrame><WorkspaceLoading /></WorkspaceFrame>}>
      <OwnerAppFrame section="kendaraan">
        <Suspense fallback={<VehicleListLoading />}><VehicleListContent searchParams={searchParams} /></Suspense>
      </OwnerAppFrame>
    </Suspense>
  );
}
