"use client";

import { useState } from "react";
import { CheckboxField, TextAreaField, TextField } from "@/components/ui/field";
import { Card } from "@/components/ui/layout";
import { ActionForm } from "./action-controls";
import { saveSeoSettingsAction } from "../actions";

export type SeoFormValue = { seoTitle: string; seoDescription: string; noindex: boolean; googleVerification: string; bingVerification: string; ogImageUrl: string | null };

export function SeoSettingsForm({ v, storeName, origin }: { v: SeoFormValue; storeName: string; origin: string }) {
  const [title, setTitle] = useState(v.seoTitle);
  const [desc, setDesc] = useState(v.seoDescription);
  return (
    <ActionForm action={saveSeoSettingsAction} encType="multipart/form-data" submitLabel="Save SEO settings">
      {(e) => (
        <div className="space-y-6">
          <Card title="Home page listing" description="How your store's home page appears in Google and when shared.">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <TextField label="Page title" name="seoTitle" value={title} onChange={(ev) => setTitle(ev.target.value)} maxLength={70} placeholder={storeName} hint={`${title.length}/70`} errors={e.seoTitle} optional />
                <TextAreaField label="Meta description" name="seoDescription" value={desc} onChange={(ev) => setDesc(ev.target.value)} maxLength={160} rows={3} hint={`${desc.length}/160`} errors={e.seoDescription} optional />
              </div>
              <div className="rounded-md border border-border bg-surface-secondary p-4" aria-label="Search result preview">
                <p className="text-caption text-muted">Search preview</p>
                <p className="mt-2 truncate text-caption text-muted">{origin}</p>
                <p className="truncate text-[18px] leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">{title || storeName}</p>
                <p className="line-clamp-2 text-small text-muted">{desc || "Add a description so search engines don't pick random text from your page."}</p>
              </div>
            </div>
          </Card>
          <Card title="Social sharing image" description="Used when a page has no image of its own (WhatsApp, Facebook, X). 1200×630 px works best.">
            {v.ogImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.ogImageUrl} alt="Current sharing image" className="mb-3 aspect-[1200/630] w-full max-w-sm rounded-md border border-border object-cover" />
            ) : null}
            <div className="space-y-3">
              <input type="file" name="ogImage" accept="image/jpeg,image/png,image/webp" className="block text-small" aria-label="Upload sharing image" />
              {v.ogImageUrl ? <CheckboxField label="Remove the current image" name="removeOgImage" value="true" /> : null}
            </div>
          </Card>
          <Card title="Search engine verification" description="Paste the verification tag or its content value to prove you own this store's domain.">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Google Search Console" name="googleVerification" defaultValue={v.googleVerification} placeholder='<meta name="google-site-verification" content="…">' hint="Search Console → Add property → URL prefix → HTML tag" errors={e.googleVerification} optional />
              <TextField label="Bing Webmaster Tools" name="bingVerification" defaultValue={v.bingVerification} placeholder='<meta name="msvalidate.01" content="…">' errors={e.bingVerification} optional />
            </div>
          </Card>
          <Card title="Visibility">
            <CheckboxField label="Hide the whole store from search engines (noindex, robots.txt disallow)" name="noindex" value="true" defaultChecked={v.noindex} hint="Use while you are setting up. Remember to switch it off before launch." />
          </Card>
        </div>
      )}
    </ActionForm>
  );
}
