"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/form";
import { ActionDialog, HiddenFields } from "@/features/settings/ui/action-controls";
import type { ActionResult } from "@/lib/actions/result";
import { bookShipmentAction, cancelShipmentAction, requestPickupAction, shipmentLabelAction, trackShipmentAction } from "../actions";

function errorOf(state: ActionResult<unknown> | null) {
  return state && !state.ok ? (state.error.fieldErrors?._form?.[0] ?? state.error.message) : null;
}

export function BookCourierButton({ orderId, courier }: { orderId: string; courier: string }) {
  const [state, action] = useActionState(bookShipmentAction, null);
  return (
    <form action={action} className="space-y-2">
      <HiddenFields fields={{ orderId }} />
      <SubmitButton size="sm">Book with {courier}</SubmitButton>
      {state?.ok ? <p role="status" className="text-xs text-success">{state.data}</p> : null}
      {errorOf(state) ? <p role="alert" className="text-xs text-error">{errorOf(state)}</p> : null}
    </form>
  );
}

/** Track / label / pickup / cancel for a courier-booked shipment. */
export function CourierShipmentActions({ shipmentId, cancellable }: { shipmentId: string; cancellable: boolean }) {
  const [track, trackAction] = useActionState(trackShipmentAction, null);
  const [label, labelAction] = useActionState(shipmentLabelAction, null);
  const [pickup, pickupAction] = useActionState(requestPickupAction, null);
  const fields = { shipmentId };
  const err = errorOf(track) ?? errorOf(label) ?? errorOf(pickup);
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={trackAction}>
          <HiddenFields fields={fields} />
          <SubmitButton size="sm" variant="secondary">Refresh tracking</SubmitButton>
        </form>
        <form action={labelAction}>
          <HiddenFields fields={fields} />
          <SubmitButton size="sm" variant="secondary">Get label</SubmitButton>
        </form>
        <form action={pickupAction}>
          <HiddenFields fields={fields} />
          <SubmitButton size="sm" variant="secondary">Request pickup</SubmitButton>
        </form>
        {cancellable ? (
          <ActionDialog
            action={cancelShipmentAction}
            fields={fields}
            title="Cancel this shipment?"
            description="The courier booking is cancelled. The order stays open so you can book again or ship manually."
            triggerLabel="Cancel shipment"
            triggerVariant="ghost"
            confirmLabel="Cancel shipment"
            variant="danger"
          />
        ) : null}
      </div>
      {err ? <p role="alert" className="text-xs text-error">{err}</p> : null}
      {label?.ok && label.data.startsWith("https://") ? (
        <a href={label.data} target="_blank" rel="noopener noreferrer" className="text-xs text-accent underline">
          Open shipping label (PDF) ↗
        </a>
      ) : null}
      {pickup?.ok ? <p role="status" className="text-xs text-success">{pickup.data}</p> : null}
      {track?.ok ? (
        <div className="rounded-md bg-surface-secondary p-2 text-xs">
          <p className="font-medium">{track.data.status}</p>
          {track.data.events.length ? (
            <ol className="mt-1 space-y-0.5 text-muted">
              {track.data.events.slice(0, 8).map((e, i) => (
                <li key={i}>
                  {e.at ? new Date(e.at).toLocaleString("en-IN") : ""} · {e.status}
                  {e.location ? ` · ${e.location}` : ""}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted">No scans yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
