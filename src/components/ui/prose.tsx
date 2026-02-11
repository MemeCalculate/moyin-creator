// Copyright (c) 2025 hotflow2024
// Licensed under AGPL-3.0-or-later. See LICENSE for details.
// Commercial licensing available. See COMMERCIAL_LICENSE.md.
import { cn } from "@/lib/utils";
import type React from "react";
import DOMPurify from "dompurify";

type ProseProps = React.HTMLAttributes<HTMLElement> & {
  as?: "article";
  html: string;
};

function Prose({ children, html, className }: ProseProps) {
  const sanitizedHtml = html ? DOMPurify.sanitize(html) : "";

  return (
    <article
      className={cn(
        "prose prose-h2:font-semibold max-w-none prose-h1:text-xl prose-a:text-blue-600 prose-p:text-justify dark:prose-invert mx-auto",
        className
      )}
    >
      {html ? <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} /> : children}
    </article>
  );
}

export default Prose;
