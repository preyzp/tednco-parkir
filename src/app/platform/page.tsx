import { Suspense } from "react";
import type { Metadata } from "next";
import { PlatformFrame } from "../../components/platform/platform-frame";
import { PlatformDashboard, PlatformDashboardLoading } from "../../components/platform/platform-content";
export const metadata: Metadata = { title: "Platform Admin — TednCo Parkir" };

export default function PlatformPage() {
  return <PlatformFrame active="overview"><Suspense fallback={<PlatformDashboardLoading />}><PlatformDashboard /></Suspense></PlatformFrame>;
}
