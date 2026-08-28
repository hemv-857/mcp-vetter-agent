import type { ReactNode } from "react";

/**
 * A deliberately small renderer for the subset of Markdown this product
 * produces: headings, bold, inline code, fenced code, a table, rules,
 * blockquotes and lists. It builds React elements — never raw HTML — so
 * anything a user types into the draft is inert text, not markup.
 *
 * NOTE: purpose-built for the draft's own grammar; reach for a real
 * Markdown library only if the draft ever has to render arbitrary documents.
 */

function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // bold and inline code, in one pass
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyBase}-b${index}`} className="font-semibold text-t1">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code
          key={`${keyBase}-c${index}`}
          className="px-1 py-[1px] font-mono text-[0.92em]" style={{ background: "var(--color-p2)", color: "var(--color-t1)" }}
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    cursor = match.index + token.length;
    index += 1;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    // fenced code
    if (line.startsWith("```")) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre
          key={`code-${index}`}
          className="my-3 overflow-x-auto px-3 py-2.5 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap" style={{ background: "var(--color-p2)", color: "var(--color-t2)" }}
        >
          {body.join("\n")}
        </pre>,
      );
      continue;
    }

    // table
    if (line.startsWith("|") && (lines[index + 1] ?? "").startsWith("|")) {
      const cells = (row: string) =>
        row.split("|").slice(1, -1).map((cell) => cell.trim());
      const head = cells(line);
      index += 2; // skip the delimiter row
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] ?? "").startsWith("|")) {
        rows.push(cells(lines[index] ?? ""));
        index += 1;
      }
      blocks.push(
        <div key={`table-${index}`} className="my-3 overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr>
                {head.map((cell, i) => (
                  <th
                    key={i}
                    className="pb-1.5 font-mono text-[10px] font-medium tracking-[0.1em] uppercase" style={{ borderBottom: "1px solid var(--color-line)", color: "var(--color-t4)" }}
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="py-1.5 font-mono" style={{ borderBottom: "1px solid var(--color-line)", color: "var(--color-t2)", fontVariantNumeric: "tabular-nums" }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push(
        <h4 key={index} className="mt-5 mb-1.5 font-mono text-[12px] font-medium tracking-[0.02em] text-t1">
          {inline(line.slice(4), `h4-${index}`)}
        </h4>,
      );
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h3 key={index} className="mt-6 mb-2 text-[15px] font-semibold tracking-[-0.01em] text-t1">
          {inline(line.slice(3), `h3-${index}`)}
        </h3>,
      );
    } else if (line.startsWith("> ")) {
      blocks.push(
        <blockquote
          key={index}
          className="my-3 pl-3 text-[12px] leading-relaxed" style={{ borderLeft: "1px solid var(--color-line-2)", color: "var(--color-t3)" }}
        >
          {inline(line.slice(2), `q-${index}`)}
        </blockquote>,
      );
    } else if (line.trim() === "---") {
      blocks.push(<hr key={index} className="my-4" style={{ borderColor: "var(--color-line)" }} />);
    } else if (line.trim() === "") {
      // paragraph break; nothing to render
    } else {
      blocks.push(
        <p key={index} className="my-1.5 text-[12.5px] leading-[1.65] text-t2">
          {inline(line.replace(/ {2}$/, ""), `p-${index}`)}
        </p>,
      );
    }
    index += 1;
  }

  return <div>{blocks}</div>;
}
