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

/** Get the file key from the current document URL (available via figma.fileKey). */
function getFileKey(): string {
  return figma.fileKey ?? 'unknown';
}

// ── Scan ───────────────────────────────────────────────────────────────────

function scanComponents(): ComponentExport[] {
  const fileKey = getFileKey();
  const results: ComponentExport[] = [];

  // Walk every page in the document
  for (const page of figma.root.children) {
    // Find all COMPONENT nodes on this page (not COMPONENT_SET — those are the
    // variant containers; we want the individual variant components inside them,
    // plus any standalone components)
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
  }

  // Sort alphabetically by group then name
  results.sort((a, b) => {
    const groupCmp = a.group.localeCompare(b.group);
    return groupCmp !== 0 ? groupCmp : a.figmaName.localeCompare(b.figmaName);
  });

  return results;
}

// ── Init ───────────────────────────────────────────────────────────────────

(async () => {
  const components = scanComponents();

  figma.ui.postMessage({
    type: 'components',
    components,
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

  // Locate: scroll and zoom Figma's viewport to a specific component
  if (msg.type === 'locate') {
    const node = await figma.getNodeByIdAsync(msg.nodeId);
    if (!node) return;

    // Switch to the correct page if the component lives elsewhere
    const page = getPage(node);
    if (page && figma.currentPage.id !== page.id) {
      await figma.setCurrentPageAsync(page);
    }

    figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
  }

  // Export: receive the selected component list from the UI, enrich with
  // current timestamp and user, then send back as a downloadable JSON blob
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
