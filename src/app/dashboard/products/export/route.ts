import { requireTenant, assertPermission } from "@/lib/tenant/membership";
import { productListQuerySchema } from "@/features/catalog/schemas";
import { productsForExport } from "@/features/catalog/server/products";
import { productsToCsv } from "@/features/catalog/csv";
import { unstable_rethrow } from "next/navigation";
import { toPublicError } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const ctx = await requireTenant();
    assertPermission(ctx, "catalog.read");
    const f = productListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const csv = productsToCsv(await productsForExport(ctx.tenantId, f));
    return new Response(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
    });
  } catch (err) {
    unstable_rethrow(err);
    return Response.json(toPublicError(err), { status: 403 });
  }
}
