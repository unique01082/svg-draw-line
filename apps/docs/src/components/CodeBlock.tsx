import { Children, isValidElement, useState, type ReactNode } from "react";

function extractText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number")
        return String(child);
      return isValidElement<{ children?: ReactNode }>(child)
        ? extractText(child.props.children)
        : "";
    })
    .join("");
}

export function CodeBlock({ children }: { readonly children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = extractText(children).trimEnd();
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>READ ONLY</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(code)
              .then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}
