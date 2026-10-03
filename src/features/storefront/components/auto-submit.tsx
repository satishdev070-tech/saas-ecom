"use client";

import type { SelectHTMLAttributes } from "react";

/** <select> that submits its form on change (progressive enhancement: the form also has a submit button). */
export function AutoSubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
