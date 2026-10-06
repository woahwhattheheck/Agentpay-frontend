"use client";

import { useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPatch } from "@/lib/apiClient";
import { TextField } from "@/components/TextField";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/ToastProvider";
import { parseNonNegativeInt } from "@/lib/validateNumber";
import {
  getOptimisticService,
  hydrateServiceSnapshot,
  runOptimisticServiceMutation,
  ServiceMutationError,
} from "@/lib/serviceOptimisticStore";

type Service = { serviceId: string; priceStroops: number };

const UPDATE_FAILURE_MESSAGE =
  "Could not update the service. Your previous price was restored.";
const RECONCILE_FAILURE_MESSAGE =
  "The price was saved, but the latest server value could not be confirmed. Refresh before editing again.";

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
  const [announcement, setAnnouncement] = useState("");
  const [pendingSaves, setPendingSaves] = useState(0);
  const [prefillLoading, setPrefillLoading] = useState(true);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [originalPrice, setOriginalPrice] = useState<string | null>(null);
  const [serverService, setServerService] = useState<Service | null>(null);
  const submitGenerationRef = useRef(0);

  const dirty = originalPrice !== null && price !== originalPrice;
  const saving = pendingSaves > 0;

  useEffect(() => {
    const load = async () => {
      setPrefillLoading(true);
      setPrefillError(null);
      try {
        const service = await apiGet<Service>(
          "/api/v1/services/" + encodeURIComponent(serviceId),
        );
        const prefilled = String(service.priceStroops);
        setServerService(service);
        hydrateServiceSnapshot(service);
        setPrice(prefilled);
        setOriginalPrice(prefilled);
      } catch (loadError) {
        setPrefillError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load service details.",
        );
      } finally {
        setPrefillLoading(false);
      }
    };
    void load();
  }, [serviceId]);

  useEffect(() => {
    if (!dirty) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const handleBack = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (
      dirty &&
      !window.confirm("You have unsaved changes. Are you sure you want to leave?")
    ) {
      event.preventDefault();
    }
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setAnnouncement("");

    const parsed = parseNonNegativeInt(price);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }

    const current =
      getOptimisticService(serviceId) ??
      serverService ?? {
        serviceId,
        priceStroops:
          originalPrice === null ? parsed.value : Number(originalPrice),
      };
    const optimistic: Service = {
      ...current,
      serviceId,
      priceStroops: parsed.value,
    };
    const submission = ++submitGenerationRef.current;

    setPendingSaves((count) => count + 1);

    try {
      const canonical = await runOptimisticServiceMutation({
        serviceId,
        current,
        optimistic,
        mutate: () =>
          apiPatch(
            "/api/v1/services/" + encodeURIComponent(serviceId) + "/price",
            { priceStroops: parsed.value },
          ),
        reconcile: () =>
          apiGet<Service>("/api/v1/services/" + encodeURIComponent(serviceId)),
        failureMessage: UPDATE_FAILURE_MESSAGE,
        reconcileMessage: RECONCILE_FAILURE_MESSAGE,
      });

      if (submission !== submitGenerationRef.current) {
        return;
      }

      const canonicalPrice = String(canonical.priceStroops);
      setServerService(canonical);
      setPrice(canonicalPrice);
      setOriginalPrice(canonicalPrice);
      toast.push("Price updated.", "info");
      router.push("/services/" + encodeURIComponent(serviceId));
    } catch (mutationError) {
      if (submission !== submitGenerationRef.current) {
        return;
      }

      const message =
        mutationError instanceof ServiceMutationError
          ? mutationError.message
          : UPDATE_FAILURE_MESSAGE;
      const rolledBack = getOptimisticService(serviceId);

      if (rolledBack) {
        const rolledBackPrice = String(rolledBack.priceStroops);
        setServerService(rolledBack);
        setPrice(rolledBackPrice);
        setOriginalPrice(rolledBackPrice);
      }

      setError(message);
      setAnnouncement(message);
    } finally {
      setPendingSaves((count) => Math.max(0, count - 1));
    }
  };

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-[60vh] max-w-xl flex-col gap-6 p-8 focus:outline-none"
    >
      <Link
        href={"/services/" + encodeURIComponent(serviceId)}
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
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-3"
          aria-busy={saving}
        >
          <TextField
            label="Price (stroops / request)"
            inputMode="numeric"
            required
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            error={error}
            description="Accepted range: 0 – 9,007,199,254,740,991 stroops"
          />
          <button
            type="submit"
            className="self-start rounded-full bg-black px-5 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            {saving ? "Saving… (submit again for newer edit)" : "Save"}
          </button>
          {announcement && (
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="sr-only"
            >
              {announcement}
            </p>
          )}
        </form>
      )}
    </main>
  );
}
