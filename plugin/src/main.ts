// ── Code Connect Export - main.ts ──────────────────────────────────────────
// Runs in Figma's plugin sandbox. Has full access to the Figma plugin API.
// Communicates with ui.html via postMessage.

figma.showUI(__html__, { width: 360, height: 520, themeColors: false });

// ── Types ──────────────────────────────────────────────────────────────────

interface ComponentProperty {
  name: string;
  type: 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP';
  values?: string[]; // possible values — VARIANT properties only
}

interface ComponentExport {
  nodeId: string;
  figmaName: string;
  group: string;
  page: string;
  url: string;
  properties: ComponentProperty[];
  variantNames?: string[]; // child variant names for COMPONENT_SET nodes
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

/**
 * Extract full property definitions: name, type, and variant values.
 * Returns [] for nodes with broken references rather than throwing.
 */
function getProperties(node: ComponentNode | ComponentSetNode): ComponentProperty[] {
  try {
    if (!node.componentPropertyDefinitions) return [];
    return Object.entries(node.componentPropertyDefinitions).map(([name, def]) => {
      const prop: ComponentProperty = { name, type: def.type };
      // variantOptions is only present on VARIANT-type definitions
      if (def.type === 'VARIANT') {
        prop.values = def.variantOptions;
      }
      return prop;
    });
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

function log(pageId: string, message: string): void {
  figma.ui.postMessage({ type: 'scan-log', pageId, message });
}

/** Yield to the event loop so queued postMessages reach the UI iframe
 *  before the next blocking findAllWithCriteria call. */
function yield_(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// Node types that can structurally contain components.
// Anything not in this set is a leaf and can be skipped entirely.
const CONTAINER_TYPES = new Set([
  'FRAME', 'GROUP', 'SECTION', 'COMPONENT', 'COMPONENT_SET',
]);

/**
 * Scan a page frame-by-frame, yielding between each top-level child so
 * log messages reach the UI in real time and slow frames are identifiable.
 *
 * Optimisations vs. a naive implementation:
 *   1. Leaf nodes (TEXT, RECTANGLE, VECTOR, etc.) are skipped before any
 *      tree traversal — they structurally cannot contain components.
 *   2. A single findAllWithCriteria call per frame retrieves both
 *      COMPONENT_SET and COMPONENT nodes in one pass instead of two.
 *   3. Variant children (COMPONENT inside a COMPONENT_SET) are excluded
 *      after the fact — the set itself represents the whole component.
 *   4. COMPONENT_SET nodes include their variant child names so the skill
 *      knows which Figma names map to a single code component.
 */
async function scanPage(page: PageNode): Promise<{ components: ComponentExport[]; skipped: SkippedComponent[] }> {
  const fileKey = getFileKey();
  const components: ComponentExport[] = [];
  const skipped: SkippedComponent[] = [];
  const topLevel = [...page.children];

  for (let i = 0; i < topLevel.length; i++) {
    const child = topLevel[i];

    // Skip leaves — TEXT, RECTANGLE, ELLIPSE, VECTOR, INSTANCE, etc.
    if (!CONTAINER_TYPES.has(child.type)) continue;

    log(page.id, `[${i + 1}/${topLevel.length}] "${child.name}"`);
    await yield_(); // flush log to UI before blocking call

    // Single traversal: collect COMPONENT_SET and COMPONENT in one pass
    let found: SceneNode[];
    if (child.type === 'COMPONENT_SET' || child.type === 'COMPONENT') {
      found = [child as SceneNode];
    } else {
      found = (child as ChildrenMixin).findAllWithCriteria({
        types: ['COMPONENT_SET', 'COMPONENT'],
      }) as SceneNode[];
    }

    for (const node of found) {
      // Variant components (COMPONENT inside a COMPONENT_SET) are covered
      // by the set itself — skip them to avoid duplicate entries.
      if (node.type === 'COMPONENT' && node.parent?.type === 'COMPONENT_SET') continue;

      try {
        const entry: ComponentExport = {
          nodeId: node.id,
          figmaName: node.name,
          group: getGroup(node.name),
          page: page.name,
          url: buildUrl(fileKey, node.id),
          properties: getProperties(node as ComponentNode | ComponentSetNode),
        };

        // Include variant child names so the skill can map multiple Figma
        // component names (e.g. Button/Primary, Button/Secondary) to one
        // code component without generating duplicate .figma.ts files.
        if (node.type === 'COMPONENT_SET') {
          entry.variantNames = (node as ComponentSetNode).children.map(c => c.name);
        }

        components.push(entry);
      } catch (err) {
        skipped.push({
          figmaName: node.name,
          page: page.name,
          reason: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  }

  components.sort((a, b) => {
    const groupCmp = a.group.localeCompare(b.group);
    return groupCmp !== 0 ? groupCmp : a.figmaName.localeCompare(b.figmaName);
  });

  return { components, skipped };
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

  // Scan: processes one page at a time and streams results back incrementally
  if (msg.type === 'scan') {
    const pageIds: string[] = msg.pageIds;

    for (const pageId of pageIds) {
      const page = figma.root.children.find(p => p.id === pageId);
      if (!page) continue;

      figma.ui.postMessage({ type: 'scan-page-start', pageId, pageName: page.name });
      const { components, skipped } = await scanPage(page);
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

  // Export: enrich selected components with metadata and trigger download
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
