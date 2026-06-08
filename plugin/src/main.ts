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

function log(pageId: string, message: string): void {
  figma.ui.postMessage({ type: 'scan-log', pageId, message });
}

/** Yield to the event loop so queued postMessages reach the UI iframe
 *  before the next blocking findAllWithCriteria call. */
function yield_(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/** Scan a single page frame-by-frame, yielding between each top-level
 *  child so the UI stays responsive and log messages arrive in real time.
 *
 *  findAllWithCriteria on the whole page blocks the sandbox thread for as
 *  long as it takes — on a large page that can be many seconds with no
 *  feedback. Scanning each top-level frame individually with a yield
 *  between them means the UI receives log updates after each frame and the
 *  user can see exactly which frame is slow.
 */
async function scanPage(page: PageNode): Promise<{ components: ComponentExport[]; skipped: SkippedComponent[] }> {
  const fileKey = getFileKey();
  const components: ComponentExport[] = [];
  const skipped: SkippedComponent[] = [];
  const topLevel = [...page.children];

  for (let i = 0; i < topLevel.length; i++) {
    const child = topLevel[i];
    log(page.id, `[${i + 1}/${topLevel.length}] "${child.name}"`);
    await yield_(); // flush log message to UI before blocking call

    // Component sets in this frame
    let sets: ComponentSetNode[] = [];
    if (child.type === 'COMPONENT_SET') {
      sets = [child as ComponentSetNode];
    } else if ('findAllWithCriteria' in child) {
      sets = (child as ChildrenMixin).findAllWithCriteria({ types: ['COMPONENT_SET'] }) as ComponentSetNode[];
    }

    for (const node of sets) {
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

    // Standalone components in this frame (not inside a component set)
    let standalone: ComponentNode[] = [];
    if (child.type === 'COMPONENT' && child.parent?.type !== 'COMPONENT_SET') {
      standalone = [child as ComponentNode];
    } else if ('findAllWithCriteria' in child) {
      const all = (child as ChildrenMixin).findAllWithCriteria({ types: ['COMPONENT'] }) as ComponentNode[];
      standalone = all.filter(n => n.parent?.type !== 'COMPONENT_SET');
    }

    for (const node of standalone) {
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

      const { components, skipped } = await scanPage(page);

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
