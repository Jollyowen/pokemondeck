"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { isApiError } from "@/types/api";

export function ShareDeckPanel({
  deckId,
  shareEnabled,
  shareToken,
  onShareStateChange,
}: {
  deckId: string;
  shareEnabled: boolean;
  shareToken: string | null;
  onShareStateChange: (next: { shareEnabled: boolean; shareToken: string | null }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    shareEnabled && shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/shared/${shareToken}`
      : null;

  useEffect(() => {
    if (!shareUrl) {
      setQrDataUrl(null);
      return;
    }
    // The QR code encodes only the shared URL, nothing else.
    QRCode.toDataURL(shareUrl, { margin: 1, width: 200 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [shareUrl]);

  async function handleEnable() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/share`, { method: "POST" });
      const body = await res.json();
      if (isApiError(body)) {
        setError(body.error.message);
        return;
      }
      onShareStateChange({ shareEnabled: true, shareToken: body.shareToken as string });
    } catch {
      setError("Couldn't enable sharing. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    if (!window.confirm("Revoke this share link? Anyone with the old link or QR code will lose access immediately.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/share`, { method: "DELETE" });
      const body = await res.json();
      if (isApiError(body)) {
        setError(body.error.message);
        return;
      }
      onShareStateChange({ shareEnabled: false, shareToken: null });
    } catch {
      setError("Couldn't revoke sharing. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-4 space-y-3">
      <h2 className="font-medium">Share</h2>

      {!shareEnabled && (
        <div>
          <p className="text-sm text-neutral-500 mb-2">
            Sharing gives anyone with the link a read-only view of this deck. They can copy it into
            their own library, but can&apos;t change your copy.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={handleEnable}
            className="min-h-11 px-4 rounded-md bg-neutral-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Enabling…" : "Enable sharing"}
          </button>
        </div>
      )}

      {shareEnabled && shareUrl && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={shareUrl}
              className="min-h-11 flex-1 min-w-[220px] rounded-md border border-neutral-300 px-2 text-sm"
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="min-h-11 px-3 rounded-md border border-neutral-300 text-sm"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>

          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- locally generated data URL, not a remote image
            <img src={qrDataUrl} alt="QR code linking to the shared deck" className="rounded-md border border-neutral-200" width={150} height={150} />
          )}

          <button
            type="button"
            disabled={busy}
            onClick={handleRevoke}
            className="min-h-11 px-4 rounded-md border border-red-200 text-red-700 text-sm disabled:opacity-50"
          >
            {busy ? "Revoking…" : "Revoke sharing"}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
