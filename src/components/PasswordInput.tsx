"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { controlBase } from "./ui";

/** A password field with a show/hide control — the control is a real button, keyboard
 * reachable, and never steals the form's submit. Lives in its own client module so the
 * shared primitives file stays usable from Server Components. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(function PasswordInput(
  { className, ...props },
  ref
) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input ref={ref} type={show ? "text" : "password"} className={cn(controlBase, "pr-16", className)} {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 px-2 rounded-md text-[11px] font-bold uppercase tracking-wide text-ink/50 hover:text-ink hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 transition-colors"
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
});
