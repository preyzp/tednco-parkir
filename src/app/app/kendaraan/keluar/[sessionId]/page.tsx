import { Suspense } from "react";
import type { Metadata } from "next";
import { WorkspaceFrame } from "../../../../../components/workspace/workspace-frame";
import { WorkspaceLoading } from "../../../../../components/workspace/workspace-status";
import { OwnerAppFrame } from "../../../../../components/workspace/workspace-content";
import { CheckoutContent, CheckoutLoading } from "../../../../../components/vehicles/checkout-content";
export const metadata: Metadata = { title: "Proses Kendaraan Keluar — TednCo Parkir" };

export default function VehicleCheckoutPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<WorkspaceFrame><WorkspaceLoading /></WorkspaceFrame>}>
      <OwnerAppFrame section="kendaraan">
        <Suspense fallback={<CheckoutLoading />}><CheckoutContent params={params} searchParams={searchParams} /></Suspense>
      </OwnerAppFrame>
    </Suspense>
  );
}
