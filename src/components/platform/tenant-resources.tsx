"use client";
import { useState } from "react";
import { LoaderCircle, MapPinPlus, MapPinOff, MapPin, Pencil } from "lucide-react";
import { changeLocationStatusAction, createLocationAction, renameOwnerAction, updateLocationAction } from "../../lib/platform-actions";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ErrorAlert, useGuardedAction } from "./tenant-management";

const Required = () => <span aria-hidden="true" className="text-destructive">*</span>;
function SubmitButton({ pending, idle, busy, disabled }: { pending: boolean; idle: string; busy: string; disabled?: boolean }) {
  return <Button type="submit" className="h-11" disabled={pending || disabled}>{pending && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}{pending ? busy : idle}</Button>;
}

// Owner display name only. Email/password are deliberately not editable here.
export function RenameOwnerDialog({ tenantId, userId, currentName }: { tenantId: string; userId: string; currentName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const { state, dispatch, pending, guard } = useGuardedAction(renameOwnerAction);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); if (next) setName(currentName); } }}>
      <DialogTrigger asChild><Button variant="outline" className="h-11"><Pencil aria-hidden="true" />Ubah nama Owner</Button></DialogTrigger>
      <DialogContent showCloseButton={!pending}>
        <form action={dispatch} onSubmit={guard} aria-busy={pending} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Ubah nama Owner</DialogTitle>
            <DialogDescription>Hanya nama tampilan yang berubah. Email, password, dan peran Owner tetap sama. Nama ini juga tampil di tenant lain jika akun yang sama menjadi anggota di sana.</DialogDescription>
          </DialogHeader>
          <ErrorAlert state={state} title="Nama Owner belum diubah" />
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="userId" value={userId} />
          <div className="space-y-2">
            <Label htmlFor="owner-rename">Nama Owner<Required /></Label>
            <Input id="owner-rename" name="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} autoComplete="off" className="h-11" disabled={pending} />
          </div>
          <p role="status" className="sr-only">{pending ? "Menyimpan nama Owner..." : ""}</p>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" className="h-11" disabled={pending}>Batal</Button></DialogClose>
            <SubmitButton pending={pending} idle="Simpan nama" busy="Menyimpan..." disabled={name.trim() === currentName || !name.trim()} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface LocationValue { readonly id: string; readonly name: string; readonly address?: string; readonly status: "active" | "inactive" | "unknown" }

// Create (no location) or edit name/address of an existing location.
export function LocationDialog({ tenantId, location }: { tenantId: string; location?: LocationValue }) {
  const editing = Boolean(location);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(location?.name ?? "");
  const [address, setAddress] = useState(location?.address ?? "");
  const { state, dispatch, pending, guard } = useGuardedAction(editing ? updateLocationAction : createLocationAction);
  const unchanged = editing && name.trim() === location!.name && address.trim() === (location!.address ?? "");
  const reset = () => { setName(location?.name ?? ""); setAddress(location?.address ?? ""); };
  const prefix = location ? `location-${location.id}` : "location-new";
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); if (next) reset(); } }}>
      <DialogTrigger asChild>
        {editing
          ? <Button variant="outline" size="sm" className="h-11" aria-label={`Ubah lokasi ${location!.name}`}><Pencil aria-hidden="true" />Ubah</Button>
          : <Button className="h-11"><MapPinPlus aria-hidden="true" />Tambah lokasi</Button>}
      </DialogTrigger>
      <DialogContent showCloseButton={!pending}>
        <form action={dispatch} onSubmit={guard} aria-busy={pending} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Ubah lokasi" : "Tambah lokasi parkir"}</DialogTitle>
            <DialogDescription>{editing ? "Ubah nama atau alamat lokasi. Status lokasi diubah terpisah." : "Lokasi baru langsung berstatus Aktif dan memakai zona waktu tenant."}</DialogDescription>
          </DialogHeader>
          <ErrorAlert state={state} title={editing ? "Lokasi belum diubah" : "Lokasi belum dibuat"} />
          <input type="hidden" name="tenantId" value={tenantId} />
          {location && <input type="hidden" name="locationId" value={location.id} />}
          <div className="space-y-2">
            <Label htmlFor={`${prefix}-name`}>Nama lokasi<Required /></Label>
            <Input id={`${prefix}-name`} name="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} className="h-11" disabled={pending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${prefix}-address`}>Alamat (opsional)</Label>
            <Input id={`${prefix}-address`} name="address" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={200} autoComplete="street-address" className="h-11" disabled={pending} />
          </div>
          <p role="status" className="sr-only">{pending ? "Menyimpan lokasi..." : ""}</p>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" className="h-11" disabled={pending}>Batal</Button></DialogClose>
            <SubmitButton pending={pending} idle={editing ? "Simpan lokasi" : "Buat lokasi"} busy="Menyimpan..." disabled={unchanged || name.trim().length < 2} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LocationStatusDialog({ tenantId, location }: { tenantId: string; location: LocationValue & { status: "active" | "inactive" } }) {
  const [open, setOpen] = useState(false);
  const { state, dispatch, pending, guard } = useGuardedAction(changeLocationStatusAction);
  const deactivate = location.status === "active";
  const to = deactivate ? "inactive" : "active";
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className={deactivate ? "h-11 text-destructive" : "h-11"} aria-label={`${deactivate ? "Nonaktifkan" : "Aktifkan"} lokasi ${location.name}`}>
          {deactivate ? <MapPinOff aria-hidden="true" /> : <MapPin aria-hidden="true" />}{deactivate ? "Nonaktifkan" : "Aktifkan"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={dispatch} onSubmit={guard} aria-busy={pending} className="space-y-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{deactivate ? `Nonaktifkan lokasi "${location.name}"?` : `Aktifkan lokasi "${location.name}"?`}</AlertDialogTitle>
            <AlertDialogDescription>Status: {deactivate ? "Aktif → Nonaktif" : "Nonaktif → Aktif"}. Dampak perubahan:</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {deactivate ? <>
              <li>Tidak ada pengguna tenant yang dapat beroperasi di lokasi ini, termasuk sesi yang sedang aktif.</li>
              <li>Admin dan Staff yang hanya ditugaskan ke lokasi ini kehilangan akses operasional.</li>
              <li>Data dan riwayat lokasi tidak dihapus. Lokasi dapat diaktifkan kembali.</li>
            </> : <>
              <li>Owner dan pengguna yang ditugaskan dapat kembali beroperasi di lokasi ini.</li>
            </>}
          </ul>
          <ErrorAlert state={state} title="Status lokasi belum diubah" />
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="locationId" value={location.id} />
          <input type="hidden" name="toStatus" value={to} />
          <input type="hidden" name="expectedStatus" value={location.status} />
          <p role="status" className="sr-only">{pending ? "Mengubah status lokasi..." : ""}</p>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" disabled={pending}>Batal</AlertDialogCancel>
            {/* Plain submit keeps the dialog open while the server works. */}
            <Button type="submit" variant={deactivate ? "destructive" : "default"} className="h-11" disabled={pending}>{pending && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}{pending ? "Memproses..." : deactivate ? "Ya, nonaktifkan" : "Ya, aktifkan"}</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
