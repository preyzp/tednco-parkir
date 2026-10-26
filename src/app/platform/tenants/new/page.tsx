import { Suspense } from "react";
import type { Metadata } from "next";
import { PlatformFrame } from "../../../../components/platform/platform-frame";
import { NewTenantContent, TenantDetailLoading } from "../../../../components/platform/platform-content";
export const metadata: Metadata = { title: "Buat Tenant — TednCo Parkir" };

export default function NewTenantPage() {
  return <PlatformFrame active="tenants"><Suspense fallback={<TenantDetailLoading />}><NewTenantContent /></Suspense></PlatformFrame>;
}
