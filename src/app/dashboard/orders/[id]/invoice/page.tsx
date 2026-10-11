import { notFound, redirect } from "next/navigation";
import { uuid } from "@/lib/validation/common";

/** Kept for existing links: the printable documents live at /print/orders. */
export default async function Page({ params }: PageProps<"/dashboard/orders/[id]/invoice">) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  redirect(`/print/orders?ids=${id}&docs=invoice`);
}
