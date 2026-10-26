"use client";
import { useActionState, useRef, useState, type FormEvent } from "react";
import { AlertCircle, Archive, ArchiveRestore, CircleCheck, CirclePause, LoaderCircle, Pencil, type LucideIcon } from "lucide-react";
import { changeTenantStatusAction, renameTenantAction, type TenantUpdateFormState } from "../../lib/platform-actions";
import { tenantStatusLabel, tenantStatusTransitions, type TenantLifecycleStatus } from "../../lib/platform-labels";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const idle: TenantUpdateFormState = { status: "idle" };

// One in-flight submission per form: `pending` disables controls, the ref
// closes the gap before that re-render. The server rejects stale repeats too.
export function useGuardedAction(action: (state: TenantUpdateFormState, formData: FormData) => Promise<TenantUpdateFormState>) {
  const submitting = useRef(false);
  const [state, dispatch, pending] = useActionState(async (previous: TenantUpdateFormState, formData: FormData) => {
    try { return await action(previous, formData); }
    finally { submitting.current = false; }
  }, idle);
  const guard = (event: FormEvent<HTMLFormElement>) => {
    if (submitting.current || pending) { event.preventDefault(); return; }
    submitting.current = true;
  };
  return { state, dispatch, pending, guard };
}
export function ErrorAlert({ state, title }: { state: TenantUpdateFormState; title: string }) {
  if (state.status !== "error" || !state.message) return null;
  return <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{title}</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert>;
}

export function RenameTenantDialog({ tenantId, currentName }: { tenantId: string; currentName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const { state, dispatch, pending, guard } = useGuardedAction(renameTenantAction);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); if (next) setName(currentName); } }}>
      <DialogTrigger asChild><Button variant="outline" className="h-11"><Pencil aria-hidden="true" />Ubah nama</Button></DialogTrigger>
      <DialogContent showCloseButton={!pending}>
        <form action={dispatch} onSubmit={guard} aria-busy={pending} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Ubah nama usaha</DialogTitle>
            <DialogDescription>Hanya nama usaha yang berubah. Slug, status, lokasi, dan akun Owner tetap sama.</DialogDescription>
          </DialogHeader>
          <ErrorAlert state={state} title="Nama belum diubah" />
          <input type="hidden" name="tenantId" value={tenantId} />
          <div className="space-y-2">
            <Label htmlFor="tenant-rename">Nama usaha<span aria-hidden="true" className="text-destructive">*</span></Label>
            <Input id="tenant-rename" name="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} className="h-11" disabled={pending} />
          </div>
          <p role="status" className="sr-only">{pending ? "Menyimpan nama usaha..." : ""}</p>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" className="h-11" disabled={pending}>Batal</Button></DialogClose>
            <Button type="submit" className="h-11" disabled={pending || name.trim() === currentName}>{pending && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}{pending ? "Menyimpan..." : "Simpan nama"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface TransitionCopy { trigger: string; icon: LucideIcon; title: string; impacts: string[]; confirm: string; destructive: boolean }
function transitionCopy(from: TenantLifecycleStatus, to: TenantLifecycleStatus): TransitionCopy {
  if (to === "suspended") return { trigger: "Tangguhkan", icon: CirclePause, title: "Tangguhkan tenant ini?", confirm: "Ya, tangguhkan", destructive: true, impacts: [
    "Semua Owner, Admin, dan Staff tenant ini langsung kehilangan akses operasional di /app, termasuk sesi yang sedang aktif.",
    "Tidak ada data yang dihapus. Riwayat dan pengaturan tetap tersimpan.",
    "Tenant dapat diaktifkan kembali kapan saja oleh Platform Admin.",
  ] };
  if (to === "archived") return { trigger: "Arsipkan", icon: Archive, title: "Arsipkan tenant ini?", confirm: "Ya, arsipkan", destructive: true, impacts: [
    "Semua pengguna tenant langsung kehilangan akses operasional, termasuk sesi yang sedang aktif.",
    "Tidak ada data yang dihapus, tetapi tenant dianggap tidak lagi beroperasi.",
    "Tenant hanya dapat dipulihkan melalui aksi \"Pulihkan dari arsip\" oleh Platform Admin.",
  ] };
  if (from === "archived") return { trigger: "Pulihkan dari arsip", icon: ArchiveRestore, title: "Pulihkan tenant dari arsip?", confirm: "Ya, pulihkan", destructive: false, impacts: [
    "Tenant kembali berstatus Aktif.",
    "Pengguna tenant dapat kembali mengakses operasional sesuai membership dan lokasi masing-masing.",
  ] };
  return { trigger: "Aktifkan kembali", icon: CircleCheck, title: "Aktifkan kembali tenant ini?", confirm: "Ya, aktifkan", destructive: false, impacts: [
    "Pengguna tenant dapat kembali mengakses operasional sesuai membership dan lokasi masing-masing.",
  ] };
}

function StatusChangeDialog({ tenantId, from, to }: { tenantId: string; from: TenantLifecycleStatus; to: TenantLifecycleStatus }) {
  const [open, setOpen] = useState(false);
  const { state, dispatch, pending, guard } = useGuardedAction(changeTenantStatusAction);
  const copy = transitionCopy(from, to);
  const Icon = copy.icon;
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
      <AlertDialogTrigger asChild><Button variant={copy.destructive ? "outline" : "default"} className={copy.destructive ? "h-11 text-destructive" : "h-11"}><Icon aria-hidden="true" />{copy.trigger}</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <form action={dispatch} onSubmit={guard} aria-busy={pending} className="space-y-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.title}</AlertDialogTitle>
            <AlertDialogDescription>Status: {tenantStatusLabel(from)} → {tenantStatusLabel(to)}. Dampak perubahan:</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm">{copy.impacts.map((impact) => <li key={impact}>{impact}</li>)}</ul>
          <ErrorAlert state={state} title="Status belum diubah" />
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="toStatus" value={to} />
          <input type="hidden" name="expectedStatus" value={from} />
          <p role="status" className="sr-only">{pending ? "Mengubah status tenant..." : ""}</p>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" disabled={pending}>Batal</AlertDialogCancel>
            {/* A plain submit (not AlertDialogAction) keeps the dialog open while the server works. */}
            <Button type="submit" variant={copy.destructive ? "destructive" : "default"} className="h-11" disabled={pending}>{pending && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}{pending ? "Memproses..." : copy.confirm}</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function TenantStatusActions({ tenantId, status }: { tenantId: string; status: TenantLifecycleStatus }) {
  return <div className="flex flex-wrap gap-2">{tenantStatusTransitions[status].map((to) => <StatusChangeDialog key={to} tenantId={tenantId} from={status} to={to} />)}</div>;
}
