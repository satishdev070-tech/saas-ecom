"use client";

import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { ActionDialog, ActionForm, InlineAction } from "@/features/settings/ui/action-controls";
import {
  addOrderNoteAction,
  cancelOrderAction,
  issueInvoiceAction,
  refundOrderAction,
  resendNotificationAction,
  saveStaffNoteAction,
  updateFulfillmentAction,
  updateReturnStatusAction,
} from "../actions";
import { statusLabel } from "../format";

type FulfillmentStep = "packed" | "shipped" | "delivered" | "rto";

/** Fulfilment buttons for the order's current state (see nextFulfillmentActions). */
export function FulfillmentActions({ orderId, steps }: { orderId: string; steps: FulfillmentStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {steps.includes("packed") ? (
        <InlineAction action={updateFulfillmentAction} fields={{ orderId, status: "packed" }} label="Mark as packed" success="Marked packed." />
      ) : null}
      {steps.includes("shipped") ? (
        <ActionDialog
          action={updateFulfillmentAction}
          fields={{ orderId, status: "shipped" }}
          title="Mark as shipped"
          description="The customer gets an email with the courier and tracking details."
          triggerLabel="Mark as shipped"
          triggerVariant="primary"
          confirmLabel="Mark shipped"
          success="Marked shipped."
        >
          {(e) => (
            <div className="space-y-3">
              <TextField label="Courier" name="carrier" required maxLength={80} placeholder="Delhivery, Blue Dart…" errors={e.carrier} autoComplete="off" />
              <TextField label="Tracking / AWB number" name="tracking" required maxLength={80} errors={e.tracking} autoComplete="off" />
              <TextField label="Tracking link" name="trackingUrl" type="url" optional placeholder="https://" errors={e.trackingUrl} hint="Must start with https://" />
            </div>
          )}
        </ActionDialog>
      ) : null}
      {steps.includes("delivered") ? (
        <InlineAction action={updateFulfillmentAction} fields={{ orderId, status: "delivered" }} label="Mark as delivered" variant="primary" success="Marked delivered." />
      ) : null}
      {steps.includes("rto") ? (
        <ActionDialog
          action={updateFulfillmentAction}
          fields={{ orderId, status: "rto" }}
          title="Mark as returned to origin (RTO)?"
          description="Use this when the courier returns the parcel undelivered. Stock is not added back automatically; adjust it in Inventory once the parcel is checked."
          triggerLabel="Mark RTO"
          variant="danger"
          confirmLabel="Mark RTO"
          success="Marked RTO."
        />
      ) : null}
    </div>
  );
}

export function CancelOrderButton({ orderId, paid }: { orderId: string; paid: boolean }) {
  return (
    <ActionDialog
      action={cancelOrderAction}
      fields={{ orderId }}
      title="Cancel this order?"
      description={
        <>
          Reserved stock is released and the customer is emailed.{" "}
          {paid ? <strong className="text-foreground">Cancelling does not refund the payment — issue a refund separately.</strong> : null}
        </>
      }
      triggerLabel="Cancel order"
      variant="danger"
      confirmLabel="Cancel order"
      success="Order cancelled."
    >
      {(e) => <TextAreaField label="Reason" name="reason" required minLength={3} maxLength={500} rows={3} errors={e.reason} hint="Shown to the customer." />}
    </ActionDialog>
  );
}

export function RefundButton({ orderId, returnId, maxRupees, label = "Refund" }: { orderId: string; returnId?: string; maxRupees: string; label?: string }) {
  return (
    <ActionDialog
      action={refundOrderAction}
      fields={returnId ? { orderId, returnId } : { orderId }}
      title="Issue a refund"
      description={
        <>
          Up to <strong className="text-foreground">₹{maxRupees}</strong> can be refunded. Online payments are refunded to the original method through Razorpay; COD refunds are recorded as
          manual (pay the customer yourself).
        </>
      }
      triggerLabel={label}
      confirmLabel="Refund"
      success="Refund recorded."
    >
      {(e) => (
        <div className="space-y-3">
          <TextField label="Amount (₹)" name="amount" inputMode="decimal" required defaultValue={maxRupees} errors={e.amount} autoComplete="off" />
          <TextAreaField label="Reason" name="reason" required minLength={3} maxLength={500} rows={2} errors={e.reason} />
        </div>
      )}
    </ActionDialog>
  );
}

export function StaffNoteForm({ orderId, note }: { orderId: string; note: string | null }) {
  return (
    <ActionForm action={saveStaffNoteAction} fields={{ orderId }} submitLabel="Save note" success="Note saved." submitVariant="secondary">
      {(e) => (
        <TextAreaField label="Staff note" name="staffNote" defaultValue={note ?? ""} maxLength={2000} rows={3} errors={e.staffNote} hint="Only your team sees this." />
      )}
    </ActionForm>
  );
}

export function TimelineNoteForm({ orderId }: { orderId: string }) {
  return (
    <ActionForm action={addOrderNoteAction} fields={{ orderId }} submitLabel="Add comment" success="Comment added." submitVariant="secondary" resetOnSuccess>
      {(e) => <TextAreaField label="Add a comment to the timeline" name="message" required maxLength={1000} rows={2} errors={e.message} />}
    </ActionForm>
  );
}

export function IssueInvoiceButton({ orderId }: { orderId: string }) {
  return <InlineAction action={issueInvoiceAction} fields={{ orderId }} label="Issue invoice" success="Invoice issued." />;
}

const EMAIL_OPTIONS = [
  { value: "order_placed", label: "Order confirmation" },
  { value: "order_shipped", label: "Shipping update" },
  { value: "order_delivered", label: "Delivered" },
  { value: "order_cancelled", label: "Cancellation" },
];

export function ResendEmailForm({ orderId }: { orderId: string }) {
  return (
    <ActionForm action={resendNotificationAction} fields={{ orderId }} submitLabel="Send email" success="Email queued." submitVariant="secondary">
      {(e) => <SelectField label="Re-send an email to the customer" name="key" options={EMAIL_OPTIONS} errors={e.key} />}
    </ActionForm>
  );
}

/** Return workflow buttons (see nextReturnStatuses). */
export function ReturnStatusActions({ returnId, next }: { returnId: string; next: ("approved" | "rejected" | "received" | "closed")[] }) {
  if (next.length === 0) return null;
  const copy: Record<string, { label: string; title: string; description: string; variant: "primary" | "danger" | "secondary" }> = {
    approved: { label: "Approve", title: "Approve this return?", description: "The customer is told to send the items back.", variant: "primary" },
    rejected: { label: "Reject", title: "Reject this return?", description: "Returned quantities are released so the items can be returned again later if needed.", variant: "danger" },
    received: { label: "Mark received", title: "Mark items received?", description: "If restock is on, the returned quantities are added back to inventory.", variant: "primary" },
    closed: { label: "Close", title: "Close this return?", description: "Closed returns can't be changed.", variant: "secondary" },
  };
  return (
    <div className="flex flex-wrap items-start gap-2">
      {next.map((s) => (
        <ActionDialog
          key={s}
          action={updateReturnStatusAction}
          fields={{ returnId, status: s }}
          title={copy[s]!.title}
          description={copy[s]!.description}
          triggerLabel={copy[s]!.label}
          variant={copy[s]!.variant}
          triggerVariant={s === "approved" || s === "received" ? "primary" : "secondary"}
          confirmLabel={copy[s]!.label}
          success={`Return ${statusLabel(s).toLowerCase()}.`}
        >
          {(e) => <TextAreaField label="Staff note" name="note" optional maxLength={2000} rows={2} errors={e.note} />}
        </ActionDialog>
      ))}
    </div>
  );
}
