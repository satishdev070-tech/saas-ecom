"use client";

import { useCallback, useRef, useState } from "react";
import { publicEnv } from "@/lib/env/public";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { STORE_ASSETS_BUCKET } from "@/lib/storage/assets";
import { cleanFilename, validateMediaFile } from "../rules";
import { prepareMediaUploadAction, prepareReplaceAction, registerMediaAction, registerReplaceAction } from "../actions";
import type { MediaItem } from "../server/media";

export type UploadStatus = "queued" | "uploading" | "processing" | "done" | "error" | "cancelled";
export type UploadTask = { id: string; file: File; name: string; size: number; type: string; progress: number; status: UploadStatus; error?: string; previewUrl: string; item?: MediaItem };

async function dimensions(file: File): Promise<{ width?: number; height?: number }> {
  try {
    const bmp = await createImageBitmap(file);
    const out = { width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  } catch {
    return {};
  }
}

/**
 * Direct browser → Supabase Storage upload with progress (XHR), using the member's own session:
 * storage RLS enforces the tenant prefix and permission. The server chooses the path beforehand
 * and re-checks the stored bytes before cataloguing the file (see features/media/server/media.ts).
 */
function putObject(path: string, file: File, token: string, upsert: boolean, onProgress: (pct: number) => void, register: (xhr: XMLHttpRequest) => void): Promise<void> {
  const env = publicEnv();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open("POST", `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${STORE_ASSETS_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    xhr.setRequestHeader("content-type", file.type);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("x-upsert", upsert ? "true" : "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 403 || xhr.status === 401 ? "You don't have permission to upload here." : "Upload failed. Check your connection and retry.")));
    xhr.onerror = () => reject(new Error("Network error. Check your connection and retry."));
    xhr.onabort = () => reject(new DOMException("Cancelled", "AbortError"));
    xhr.send(file);
  });
}

export function useMediaUploads({ folder, onUploaded, replaceId }: { folder: string; onUploaded?: (item: MediaItem) => void; replaceId?: string }) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const xhrs = useRef(new Map<string, XMLHttpRequest>());

  const patch = useCallback((id: string, p: Partial<UploadTask>) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t))), []);

  const run = useCallback(
    async (task: UploadTask) => {
      patch(task.id, { status: "uploading", progress: 0, error: undefined });
      try {
        const dims = await dimensions(task.file);
        const problem = validateMediaFile({ name: task.file.name, size: task.file.size, type: task.file.type, ...dims });
        if (problem) throw new Error(problem);
        const prepared = replaceId ? await prepareReplaceAction(replaceId) : await prepareMediaUploadAction([{ name: task.file.name, size: task.file.size, type: task.file.type, ...dims }]);
        if (!prepared.ok) throw new Error(prepared.error.message);
        const path = "path" in prepared.data ? prepared.data.path : prepared.data.paths[0]!;
        const { data } = await getSupabaseBrowserClient().auth.getSession();
        if (!data.session) throw new Error("Your session expired. Sign in again.");
        await putObject(path, task.file, data.session.access_token, Boolean(replaceId), (pct) => patch(task.id, { progress: pct }), (x) => xhrs.current.set(task.id, x));
        patch(task.id, { status: "processing", progress: 100 });
        const registered = replaceId
          ? await registerReplaceAction({ id: replaceId, filename: cleanFilename(task.file.name), width: dims.width ?? null, height: dims.height ?? null })
          : await registerMediaAction({ path, filename: cleanFilename(task.file.name), folder, width: dims.width ?? null, height: dims.height ?? null });
        if (!registered.ok) throw new Error(registered.error.message);
        patch(task.id, { status: "done", item: registered.data.item });
        onUploaded?.(registered.data.item);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") patch(task.id, { status: "cancelled" });
        else patch(task.id, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
      } finally {
        xhrs.current.delete(task.id);
      }
    },
    [folder, onUploaded, patch, replaceId],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = [...files].slice(0, replaceId ? 1 : 20);
      const created = list.map((file) => ({
        id: crypto.randomUUID(),
        file,
        name: cleanFilename(file.name),
        size: file.size,
        type: file.type,
        progress: 0,
        status: "queued" as const,
        previewUrl: URL.createObjectURL(file),
      }));
      setTasks((ts) => [...created, ...ts]);
      // Upload three at a time.
      const queue = [...created];
      const worker = async () => {
        for (let t = queue.shift(); t; t = queue.shift()) await run(t);
      };
      void Promise.all([worker(), worker(), worker()]);
    },
    [replaceId, run],
  );

  const cancel = useCallback((id: string) => xhrs.current.get(id)?.abort(), []);
  const retry = useCallback(
    (id: string) => {
      const t = tasks.find((x) => x.id === id);
      if (t) void run(t);
    },
    [run, tasks],
  );
  const dismiss = useCallback((id: string) => {
    setTasks((ts) => {
      const t = ts.find((x) => x.id === id);
      if (t) URL.revokeObjectURL(t.previewUrl);
      return ts.filter((x) => x.id !== id);
    });
  }, []);
  const clearFinished = useCallback(() => setTasks((ts) => ts.filter((t) => t.status !== "done")), []);

  return { tasks, addFiles, cancel, retry, dismiss, clearFinished };
}
