import { Suspense } from "react";
import type { Metadata } from "next";
import { PlatformFrame } from "../../../components/platform/platform-frame";
import { TenantDirectory, TenantListLoading } from "../../../components/platform/platform-content";
export const metadata: Metadata = { title: "Daftar Tenant — TednCo Parkir" };

export default function PlatformTenantsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <PlatformFrame active="tenants"><Suspense fallback={<TenantListLoading />}><TenantDirectory searchParams={searchParams} /></Suspense></PlatformFrame>;
}
