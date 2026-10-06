"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet } from "@/lib/apiClient";
import { PageShell } from "@/components/PageShell";
import { TextField } from "@/components/TextField";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/ToastProvider";
import { parseNonNegativeInt } from "@/lib/validateNumber";
import { runServiceMutation } from "@/lib/serviceMutationQueue";

type Service = { serviceId: string; priceStroops: number };

export default function EditServicePage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(true);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [originalPrice, setOriginalPrice] = useState<string | null>(null);

  const dirty = originalPrice !== null && price !== originalPrice;

  useEffect(() => {
    const load = async () => {
      setPrefillLoading(true);
      setPrefillError(null);
      try {
        const s = await apiGet<Service>(
          `/api/v1/services/${encodeURIComponent(serviceId)}`,
        );
        const prefilled = String(s.priceStroops);
        setPrice(prefilled);
        setOriginalPrice(prefilled);
      } catch (e) {
        setPrefillError((e as Error).message);
      } finally {
        setPrefillLoading(false);
      }
    };
    void load();
  }, [serviceId]);

  useEffect(() => {
    if (!dirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const handleBack = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (dirty && !window.confirm("You have unsaved changes. Are you sure you want to leave?")) {
      e.preventDefault();
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = parseNonNegativeInt(price);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }

    setSaving(true);
    try {
      const result = await runServiceMutation<unknown>({
        kind: "service.price.update",
        serviceId,
        path: `/api/v1/services/${encodeURIComponent(serviceId)}/price`,
        body: { priceStroops: parsed.value },
        basePriceStroops: Number(originalPrice),
      });
      setOriginalPrice(price);
      if (result.queued) {
        toast.push("Price change queued. It will sync when you reconnect.", "info");
        return;
      }
      toast.push("Price updated.", "info");
      router.push(`/services/${encodeURIComponent(serviceId)}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-[60vh] max-w-xl flex-col gap-6 p-8 focus:outline-none"
    >
      <Link
        href={`/services/${encodeURIComponent(serviceId)}`}
        onClick={handleBack}
        className="text-sm text-zinc-500 hover:underline"
      >
        ← Back to service
      </Link>

      <h1 className="text-3xl font-semibold tracking-tight">Edit price</h1>
      <p className="font-mono text-sm text-zinc-500">{serviceId}</p>

      {prefillLoading && <Spinner label="Loading service details" />}

      {prefillError && (
        <p role="alert" className="text-sm text-rose-600">
          {prefillError}
        </p>
      )}

      {!prefillLoading && !prefillError && (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <TextField
            label="Price (stroops / request)"
            inputMode="numeric"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={error}
            description="Accepted range: 0 – 9,007,199,254,740,991 stroops"
          />
          <button
            type="submit"
            disabled={saving}
            className="self-start rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </main>
  );
}
