"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { parseNonNegativeInt } from "@/lib/validateNumber";
import { useApiMutation } from "@/lib/useApiMutation";
import { runServiceMutation } from "@/lib/serviceMutationQueue";

type CreateServiceBody = {
  serviceId: string;
  priceStroops: number;
};

export default function NewServicePage() {
  const router = useRouter();
  const [serviceId, setServiceId] = useState("");
  const [priceStroops, setPriceStroops] = useState("");
  const [priceError, setPriceError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  const { mutate, status, error, reset } = useApiMutation(
    (body: CreateServiceBody, { signal }) =>
      runServiceMutation<unknown>(
        {
          kind: "service.create",
          serviceId: body.serviceId,
          path: "/api/v1/services",
          body,
        },
        { signal },
      ),
  );

  const loading = status === "pending";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    setQueued(false);
    setPriceError(null);

    const parsed = parseNonNegativeInt(priceStroops);
    if (!parsed.ok) {
      setPriceError(parsed.message);
      return;
    }

    try {
      const result = await mutate({
        serviceId,
        priceStroops: parsed.value,
      });
      if (result.queued) {
        setQueued(true);
        return;
      }
      router.push("/services");
    } catch {
      // Error message is already mirrored on the mutation `error` state.
    }
  };

  return (
    <PageShell maxWidth="xl" gap="6">
      <h1 className="text-3xl font-semibold tracking-tight">New service</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <TextField
          label="Service ID"
          required
          maxLength={128}
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        />

        <TextField
          label="Price (stroops / request)"
          inputMode="numeric"
          required
          value={priceStroops}
          onChange={(e) => setPriceStroops(e.target.value)}
          error={priceError || undefined}
          description="Accepted range: 0 – 9,007,199,254,740,991 stroops"
        />

        <Button
          type="submit"
          loading={loading}
          disabled={loading || queued}
          className="self-start"
        >
          {loading ? "Saving…" : queued ? "Queued for sync" : "Register service"}
        </Button>

        {queued && (
          <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
            Service registration is saved on this device and will sync when connectivity returns.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-600">
            {error}
          </p>
        )}
      </form>
    </PageShell>
  );
}
