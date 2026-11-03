type Node = { type: string; value?: string; url?: string; children?: Node[] };
export type TaskResolver = (key: string) => string | null;

/** Transform text nodes only: preserve code, existing links, images and raw HTML. */
export function taskLinks(resolve: TaskResolver) {
  return () => (tree: Node) => {
    function walk(parent: Node) {
      if (["link", "linkReference", "code", "inlineCode", "html", "image", "imageReference"].includes(parent.type)) return;
      if (!parent.children) return;
      parent.children = parent.children.flatMap((node): Node[] => {
        if (node.type !== "text" || !node.value) { walk(node); return [node]; }
        const parts: Node[] = [];
        let last = 0;
        for (const match of node.value.matchAll(/\b[A-Z]{2,6}-[1-9]\d*\b/g)) {
          const url = resolve(match[0]);
          if (!url) continue;
          if (match.index > last) parts.push({ type: "text", value: node.value.slice(last, match.index) });
          parts.push({ type: "link", url, children: [{ type: "text", value: match[0] }] });
          last = match.index + match[0].length;
        }
        if (!parts.length) return [node];
        if (last < node.value.length) parts.push({ type: "text", value: node.value.slice(last) });
        return parts;
      });
    }
    walk(tree);
  };
}
