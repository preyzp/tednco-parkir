import { Suspense } from "react";
import type { Metadata } from "next";
import { PlatformFrame } from "../../../../components/platform/platform-frame";
import { TenantDetailContent, TenantDetailLoading } from "../../../../components/platform/platform-content";
export const metadata: Metadata = { title: "Detail Tenant — TednCo Parkir" };

export default function TenantDetailPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <PlatformFrame active="tenants"><Suspense fallback={<TenantDetailLoading />}><TenantDetailContent params={params} searchParams={searchParams} /></Suspense></PlatformFrame>;
}
