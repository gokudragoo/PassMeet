"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ALEO_NETWORK } from "@/lib/aleo";
import { buildEntryQrPayload, createGateLink, encodeEntryQrPayload } from "@/lib/entryQr";
import type { Ticket } from "@/context/PassMeetContext";

interface EntryQrDialogProps {
  ticket: Ticket;
}

export function EntryQrDialog({ ticket }: EntryQrDialogProps) {
  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const encodedPayload = useMemo(() => {
    const payload = buildEntryQrPayload({
      network: ALEO_NETWORK,
      eventId: ticket.eventId,
      ticketId: ticket.ticketId,
      eventName: ticket.eventName,
      date: ticket.date,
      location: ticket.location,
      txHash: ticket.txHash || undefined,
    });
    return encodeEntryQrPayload(payload);
  }, [ticket]);

  const gateLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return createGateLink(encodedPayload, window.location.origin);
  }, [encodedPayload]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const render = async () => {
      setLoading(true);
      try {
        const mod = await import("qrcode");
        const dataUrl = await mod.toDataURL(encodedPayload, {
          width: 320,
          margin: 1,
          color: {
            dark: "#08120b",
            light: "#00000000",
          },
        });
        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to generate QR code");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [encodedPayload, open]);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-white/10 bg-white/5 font-bold hover:bg-white/10 text-white rounded-full">
          <QrCode className="mr-2 h-4 w-4" />
          Entry QR
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-zinc-950 text-white sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Scan For Gate Entry</DialogTitle>
          <DialogDescription>
            This QR carries only entry metadata. The private Aleo ticket record stays in the holder&apos;s wallet.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-[320px,1fr]">
          <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 to-white/5 p-4">
            <div className="flex aspect-square items-center justify-center rounded-2xl bg-white">
              {loading ? (
                <Loader2 className="h-8 w-8 animate-spin text-black" />
              ) : qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt={`QR for ${ticket.eventName}`} className="h-full w-full rounded-2xl object-contain p-2" />
              ) : (
                <QrCode className="h-12 w-12 text-black/40" />
              )}
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-widest text-zinc-500">Ticket</p>
              <p className="mt-1 text-lg font-bold">{ticket.eventName}</p>
              <p className="mt-2 text-sm text-zinc-400">{ticket.date || "Date pending"} - {ticket.location || "Location pending"}</p>
              <p className="mt-2 text-xs text-zinc-500">Event #{ticket.eventId} / Ticket #{ticket.ticketId} / {ALEO_NETWORK}</p>
            </div>

            <div className="space-y-2">
              <Button type="button" className="w-full bg-primary text-black hover:bg-primary/90" onClick={() => copyText(encodedPayload, "QR payload")}>
                <Copy className="mr-2 h-4 w-4" />
                Copy Payload
              </Button>
              <Button type="button" variant="outline" className="w-full border-white/10" onClick={() => copyText(gateLink, "Gate link")} disabled={!gateLink}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Copy Gate Link
              </Button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs uppercase tracking-widest text-zinc-500">Operational Notes</p>
              <p className="mt-2 text-sm text-zinc-300">Organizer devices can scan this QR, but on-chain verification still requires the matching private ticket record in the active wallet session.</p>
              <p className="mt-2 text-sm text-zinc-500">Best flow: attendee opens the gate link on the same wallet-connected device or scans from a second screen.</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
