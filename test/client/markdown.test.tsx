import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { taskLinks } from "../../src/client/lib/markdown";
const render = (text: string) => renderToStaticMarkup(<ReactMarkdown skipHtml remarkPlugins={[remarkBreaks, taskLinks((key) => key === "WEB-12" ? "/w/main/p/WEB/t/12" : null)]}>{text}</ReactMarkdown>);
describe("Markdown safety and Task references", () => {
  it("links known keys in text but preserves code and existing Markdown links", () => {
    const html = render("WEB-12 UNKNOWN-4\n\n`WEB-12`\n\n```\nWEB-12\n```\n\n[WEB-12](https://example.com)");
    expect(html.match(/href="\/w\/main\/p\/WEB\/t\/12"/g)).toHaveLength(1);
    expect(html).toContain("<code>WEB-12</code>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("UNKNOWN-4");
  });
  it("disables raw HTML and unsafe URLs and preserves typed line breaks", () => {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert%281%29)\n\nline one\nline two');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("line one<br/>");
  });
});
