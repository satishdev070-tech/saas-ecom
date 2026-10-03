"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Images, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { MEDIA_FOLDERS, MEDIA_TYPES } from "../rules";
import type { MediaItem } from "../server/media";
import { Dropzone, MediaDetails, MediaGrid, UploadQueue } from "./media-ui";
import { useMediaUploads } from "./use-media-uploads";

const control = "h-9 rounded-md border border-border bg-surface px-2.5 text-small shadow-xs focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15";

export function MediaLibrary({ items, total, folders, page, pageSize, canUpload }: { items: MediaItem[]; total: number; folders: string[]; page: number; pageSize: number; canUpload: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<MediaItem | null>(null);
  const [showUpload, setShowUpload] = useState(items.length === 0);
  const [q, setQ] = useState(sp.get("q") ?? "");
  const folder = sp.get("folder") ?? "";
  const uploads = useMediaUploads({ folder: folder || "general", onUploaded: () => start(() => router.refresh()) });

  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page");
    start(() => router.push(`${pathname}?${next.toString()}`));
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) setParam({ q });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on the search box only
  }, [q]);

  const allFolders = [...new Set([...MEDIA_FOLDERS, ...folders])];
  const filtered = Boolean(sp.get("q") || folder || sp.get("type"));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <label htmlFor="media-q" className="sr-only">
            Search media
          </label>
          <input id="media-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by file name or alt text" className={`${control} w-full pl-8`} />
        </div>
        <label className="sr-only" htmlFor="media-folder">
          Folder
        </label>
        <select id="media-folder" value={folder} onChange={(e) => setParam({ folder: e.target.value })} className={control}>
          <option value="">All folders</option>
          {allFolders.map((f) => (
            <option key={f} value={f}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="media-type">
          File type
        </label>
        <select id="media-type" value={sp.get("type") ?? ""} onChange={(e) => setParam({ type: e.target.value })} className={control}>
          <option value="">All types</option>
          {Object.keys(MEDIA_TYPES).map((t) => (
            <option key={t} value={t}>
              {t.replace("image/", "").toUpperCase()}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="media-sort">
          Sort
        </label>
        <select id="media-sort" value={sp.get("sort") ?? "newest"} onChange={(e) => setParam({ sort: e.target.value === "newest" ? "" : e.target.value })} className={control}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
          <option value="largest">Largest first</option>
        </select>
        {canUpload ? (
          <Button onClick={() => setShowUpload((v) => !v)} aria-expanded={showUpload}>
            <Upload aria-hidden /> Upload
          </Button>
        ) : null}
      </div>

      {canUpload && showUpload ? <Dropzone onFiles={uploads.addFiles} /> : null}
      <UploadQueue tasks={uploads.tasks} onCancel={uploads.cancel} onRetry={uploads.retry} onDismiss={uploads.dismiss} onClear={uploads.clearFinished} />

      <div aria-busy={pending} className={pending ? "opacity-70 transition-opacity" : undefined}>
        {items.length ? (
          <>
            <p className="mb-3 text-small text-muted">
              {total} {total === 1 ? "image" : "images"}
              {filtered ? " match your filters" : ""}
            </p>
            <MediaGrid items={items} onOpen={setOpen} />
            {total > page * pageSize ? (
              <div className="mt-6 flex justify-center">
                <Button variant="secondary" onClick={() => setParam({ page: String(page + 1) })}>
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        ) : filtered ? (
          <EmptyState icon={<Search />} title="No images match" description="Try another search term or clear the filters." action={<Button variant="secondary" onClick={() => (setQ(""), start(() => router.push(pathname)))}>Clear filters</Button>} />
        ) : (
          <EmptyState icon={<Images />} title="Your media library is empty" description="Upload product photos, banners and logos once, then reuse them anywhere in your store." />
        )}
      </div>

      {open ? (
        <MediaDetails
          key={open.id}
          item={open}
          folders={folders}
          onClose={() => setOpen(null)}
          onDeleted={() => start(() => router.refresh())}
          onReplaced={() => start(() => router.refresh())}
        />
      ) : null}
    </div>
  );
}
