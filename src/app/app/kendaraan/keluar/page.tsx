import { Suspense } from "react";
import type { Metadata } from "next";
import { WorkspaceFrame } from "../../../../components/workspace/workspace-frame";
import { WorkspaceLoading } from "../../../../components/workspace/workspace-status";
import { OwnerAppFrame } from "../../../../components/workspace/workspace-content";
import { CheckoutSearchContent, CheckoutSearchLoading } from "../../../../components/vehicles/checkout-search-content";
export const metadata: Metadata = { title: "Kendaraan Keluar — TednCo Parkir" };

export default function VehicleExitSearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<WorkspaceFrame><WorkspaceLoading /></WorkspaceFrame>}>
      <OwnerAppFrame section="kendaraan">
        <Suspense fallback={<CheckoutSearchLoading />}><CheckoutSearchContent searchParams={searchParams} /></Suspense>
      </OwnerAppFrame>
    </Suspense>
  );
}
