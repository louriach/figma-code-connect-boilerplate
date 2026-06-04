// ── Code Connect Export — main.ts ──────────────────────────────────────────
// Runs in Figma's plugin sandbox. Has full access to the Figma plugin API.
// Communicates with ui.html via postMessage.

figma.showUI(__html__, { width: 360, height: 520, themeColors: false });

// ── Types ──────────────────────────────────────────────────────────────────

interface ComponentExport {
  nodeId: string;
  figmaName: string;
  group: string;
  page: string;
  url: string;
  properties: string[];
}

interface PageSummary {
  id: string;
  name: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Walk up the node tree to find the parent PAGE node. */
function getPage(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node;
  while (current) {
    if (current.type === 'PAGE') return current as PageNode;
    current = current.parent;
  }
  return null;
}

/** Derive the group name from the Figma component name (text before the first '/'). */
function getGroup(name: string): string {
  const parts = name.split('/');
  return parts.length > 1 ? parts[0].trim() : 'Ungrouped';
}

/** Extract property names from a component node. */
function getProperties(node: ComponentNode): string[] {
  if (!node.componentPropertyDefinitions) return [];
  return Object.keys(node.componentPropertyDefinitions);
}

/** Build the Figma deep-link URL for a node. */
function buildUrl(fileKey: string, nodeId: string): string {
  const encodedId = nodeId.replace(':', '%3A');
  return `https://www.figma.com/file/${fileKey}?node-id=${encodedId}`;
}

/** Get the file key from the current document. */
function getFileKey(): string {
  return figma.fileKey ?? 'unknown';
}

/** Scan a single page and return its components. */
function scanPage(page: PageNode): ComponentExport[] {
  const fileKey = getFileKey();
  const results: ComponentExport[] = [];

  const components = page.findAllWithCriteria({ types: ['COMPONENT'] });

  for (const node of components) {
    results.push({
      nodeId: node.id,
      figmaName: node.name,
      group: getGroup(node.name),
      page: page.name,
      url: buildUrl(fileKey, node.id),
      properties: getProperties(node),
    });
  }

  results.sort((a, b) => {
    const groupCmp = a.group.localeCompare(b.group);
    return groupCmp !== 0 ? groupCmp : a.figmaName.localeCompare(b.figmaName);
  });

  return results;
}

// ── Init — send pages immediately, don't scan yet ─────────────────────────

(async () => {
  const pages: PageSummary[] = figma.root.children.map(p => ({
    id: p.id,
    name: p.name,
  }));

  figma.ui.postMessage({
    type: 'pages',
    pages,
    meta: {
      fileKey: getFileKey(),
      fileName: figma.root.name,
      exportedBy: {
        name: figma.currentUser?.name ?? 'Unknown',
        id: figma.currentUser?.id ?? null,
      },
    },
  });
})();

// ── Message handler ────────────────────────────────────────────────────────

figma.ui.onmessage = async (msg) => {

  // Scan: called when user clicks "Scan selected pages"
  // Processes one page at a time and streams results back incrementally
  if (msg.type === 'scan') {
    const pageIds: string[] = msg.pageIds;

    for (const pageId of pageIds) {
      const page = figma.root.children.find(p => p.id === pageId);
      if (!page) continue;

      // Notify UI that this page is being scanned
      figma.ui.postMessage({ type: 'scan-page-start', pageId, pageName: page.name });

      const components = scanPage(page);

      // Stream this page's results to the UI as soon as they're ready
      figma.ui.postMessage({ type: 'scan-page-done', pageId, pageName: page.name, components });
    }

    figma.ui.postMessage({ type: 'scan-complete' });
  }

  // Locate: scroll and zoom Figma's viewport to a specific component
  if (msg.type === 'locate') {
    const node = await figma.getNodeByIdAsync(msg.nodeId);
    if (!node) return;

    const page = getPage(node);
    if (page && figma.currentPage.id !== page.id) {
      await figma.setCurrentPageAsync(page);
    }

    figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
  }

  // Export: receive selected components, enrich with metadata, trigger download
  if (msg.type === 'export') {
    const payload = {
      fileKey: getFileKey(),
      fileName: figma.root.name,
      exportedAt: new Date().toISOString(),
      exportedBy: {
        name: figma.currentUser?.name ?? 'Unknown',
        id: figma.currentUser?.id ?? null,
      },
      components: msg.components as ComponentExport[],
    };

    figma.ui.postMessage({
      type: 'download',
      json: JSON.stringify(payload, null, 2),
      filename: 'figma-components.json',
    });

    figma.ui.postMessage({
      type: 'export-done',
      count: (msg.components as ComponentExport[]).length,
    });
  }

};
