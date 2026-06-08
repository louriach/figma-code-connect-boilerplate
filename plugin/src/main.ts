// ── Code Connect Export - main.ts ──────────────────────────────────────────
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

interface SkippedComponent {
  figmaName: string;
  page: string;
  reason: string;
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

/** Extract property names from a component or component set node.
 *  Wrapped in try/catch because component sets with broken references
 *  (missing styles, detached instances) throw on property access.
 */
function getProperties(node: ComponentNode | ComponentSetNode): string[] {
  try {
    if (!node.componentPropertyDefinitions) return [];
    return Object.keys(node.componentPropertyDefinitions);
  } catch {
    return [];
  }
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

/** Scan a single page and return its components plus any skipped nodes.
 *
 * Figma has three relevant node types:
 *   COMPONENT_SET  - the container for a set of variants (e.g. "Button")
 *   COMPONENT      - either a standalone component OR a variant inside a set
 *
 * For Code Connect we want one entry per logical component:
 *   - COMPONENT_SET nodes  -> include, read properties from the set
 *   - Standalone COMPONENTs (parent is not a COMPONENT_SET) -> include
 *   - Variant COMPONENTs   (parent IS a COMPONENT_SET) -> skip; covered by the set
 */
function scanPage(page: PageNode): { components: ComponentExport[]; skipped: SkippedComponent[] } {
  const fileKey = getFileKey();
  const components: ComponentExport[] = [];
  const skipped: SkippedComponent[] = [];

  // Collect component sets (grouped variants)
  const componentSets = page.findAllWithCriteria({ types: ['COMPONENT_SET'] }) as ComponentSetNode[];
  for (const node of componentSets) {
    try {
      components.push({
        nodeId: node.id,
        figmaName: node.name,
        group: getGroup(node.name),
        page: page.name,
        url: buildUrl(fileKey, node.id),
        properties: getProperties(node),
      });
    } catch (err) {
      skipped.push({
        figmaName: node.name,
        page: page.name,
        reason: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  // Collect standalone components (not children of a component set)
  const allComponents = page.findAllWithCriteria({ types: ['COMPONENT'] }) as ComponentNode[];
  for (const node of allComponents) {
    if (node.parent?.type === 'COMPONENT_SET') continue; // variant - skip
    try {
      components.push({
        nodeId: node.id,
        figmaName: node.name,
        group: getGroup(node.name),
        page: page.name,
        url: buildUrl(fileKey, node.id),
        properties: getProperties(node),
      });
    } catch (err) {
      skipped.push({
        figmaName: node.name,
        page: page.name,
        reason: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  components.sort((a, b) => {
    const groupCmp = a.group.localeCompare(b.group);
    return groupCmp !== 0 ? groupCmp : a.figmaName.localeCompare(b.figmaName);
  });

  return { components, skipped };
}

// ── Init - send pages immediately, don't scan yet ─────────────────────────

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

      const { components, skipped } = scanPage(page);

      // Stream this page's results to the UI as soon as they're ready
      figma.ui.postMessage({ type: 'scan-page-done', pageId, pageName: page.name, components, skipped });
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
