import { Archive, CircleCheck, CircleHelp, CirclePause } from "lucide-react";
import type { PlatformTenantRow } from "../../lib/dal/platform-tenants";
import Link from "next/link";
import { PLATFORM_TENANTS_PATH, formatCount, formatTenantDate, tenantStatusLabel, type TenantStatusValue } from "../../lib/platform-labels";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

const statusIcons = { active: CircleCheck, suspended: CirclePause, archived: Archive, unknown: CircleHelp } as const;

// Status uses text + icon, never color alone.
export function TenantStatusBadge({ status }: { status: TenantStatusValue }) {
  const Icon = statusIcons[status];
  return <Badge variant={status === "active" ? "default" : "outline"}><Icon aria-hidden="true" />{tenantStatusLabel(status)}</Badge>;
}

function TenantLink({ row }: { row: PlatformTenantRow }) {
  if (!row.id) return <>{row.name}</>;
  return <Link href={`${PLATFORM_TENANTS_PATH}/${row.id}`} className="underline-offset-4 hover:underline focus-visible:underline">{row.name}</Link>;
}

// Read-only directory rows; the name links to the tenant detail page.
export function TenantTable({ rows, caption }: { rows: readonly PlatformTenantRow[]; caption: string }) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Nama Usaha</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col" className="text-right">Jumlah Lokasi</TableHead>
              <TableHead scope="col">Tanggal Dibuat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-xs truncate font-medium" title={row.name}><TenantLink row={row} /></TableCell>
                <TableCell><TenantStatusBadge status={row.status} /></TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(row.locationCount)}</TableCell>
                <TableCell className="text-muted-foreground">{formatTenantDate(row.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="divide-y divide-border md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={row.id} className="space-y-2 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 font-medium break-words"><TenantLink row={row} /></p>
              <TenantStatusBadge status={row.status} />
            </div>
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <div className="flex gap-1"><dt>Lokasi:</dt><dd className="tabular-nums text-foreground">{formatCount(row.locationCount)}</dd></div>
              <div className="flex gap-1"><dt>Dibuat:</dt><dd>{formatTenantDate(row.createdAt)}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
