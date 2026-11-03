// Ambil SVG proses utama + semua sub-proses (berjenjang) dari XML BPMN TANPA membuka
// studio — memakai viewer bpmn-js tersembunyi. Logika urutan plane meniru ekspor di
// BPMNViewer (registerExportApi) supaya PDF unduh massal sama dgn PDF dari studio.

export interface HalamanBpmn { svg: string; subs: { id: string; name: string; svg: string; depth: number; path: string[] }[] }

type XRoot = { id: string; parent?: unknown; children?: unknown[]; businessObject?: { name?: string } };

export async function ambilHalamanBpmn(xml: string): Promise<HalamanBpmn> {
  const [{ default: NavigatedViewer }, { default: poolGroupRendererModule }, { simpelModdleDescriptor, fontStyleModule }, { repairBpmnXml }] = await Promise.all([
    import('bpmn-js/lib/NavigatedViewer'),
    import('@/components/bpmnPoolGroupRenderer'),
    import('@/components/bpmnFontStyle'),
    import('@/components/BPMNViewer'),
  ]);
  try { await document.fonts.load('12px "URW Bookman"'); } catch { /* lanjut */ }
  const wadah = document.createElement('div');
  wadah.style.cssText = 'position:fixed;left:-20000px;top:0;width:1400px;height:900px;visibility:hidden;pointer-events:none';
  document.body.appendChild(wadah);
  const font = "'URW Bookman', 'Bookman Old Style', Bookman, Georgia, serif";
  const viewer = new NavigatedViewer({
    container: wadah,
    moddleExtensions: { simpel: simpelModdleDescriptor },
    additionalModules: [poolGroupRendererModule, fontStyleModule],
    textRenderer: { defaultStyle: { fontFamily: font }, externalStyle: { fontFamily: font } },
  } as ConstructorParameters<typeof NavigatedViewer>[0]);
  try {
    await viewer.importXML(repairBpmnXml(xml));
    const canvas = viewer.get('canvas') as unknown as { getRootElement: () => XRoot; setRootElement: (r: object) => void };
    const reg = viewer.get('elementRegistry') as unknown as {
      filter: (fn: (el: XRoot) => boolean) => XRoot[];
      get: (id: string) => { parent?: { id?: string } } | undefined;
    };
    const saveSVG = () => (viewer as unknown as { saveSVG: () => Promise<{ svg: string }> }).saveSVG();
    const roots = reg.filter(el => !el.parent && !!el.id);
    const mainRoot = roots.find(r => !String(r.id).endsWith('_plane')) || canvas.getRootElement();
    const subRoots = roots.filter(r => String(r.id).endsWith('_plane') && (r.children || []).length > 0);
    const planeById = new Map<string, XRoot>();
    for (const p of subRoots) planeById.set(String(p.id), p);
    const nameOfPlane = (p: XRoot) => p.businessObject?.name || String(p.id).replace(/_plane$/, '');
    const parentPlaneId = (p: XRoot): string | null => {
      const parentId = reg.get(String(p.id).replace(/_plane$/, ''))?.parent?.id;
      return parentId && parentId.endsWith('_plane') && planeById.has(parentId) ? parentId : null;
    };
    const childrenOf = new Map<string | null, XRoot[]>();
    for (const p of subRoots) { const k = parentPlaneId(p); const arr = childrenOf.get(k) || []; arr.push(p); childrenOf.set(k, arr); }
    const urut: { plane: XRoot; depth: number; path: string[] }[] = [];
    const jalan = (key: string | null, depth: number, prefix: string[]) => {
      for (const p of (childrenOf.get(key) || [])) { const path = [...prefix, nameOfPlane(p)]; urut.push({ plane: p, depth, path }); jalan(String(p.id), depth + 1, path); }
    };
    jalan(null, 0, []);
    canvas.setRootElement(mainRoot as unknown as object);
    const svg = (await saveSVG()).svg;
    const subs: HalamanBpmn['subs'] = [];
    for (const { plane, depth, path } of urut) {
      canvas.setRootElement(plane as unknown as object);
      subs.push({ id: String(plane.id), name: nameOfPlane(plane), svg: (await saveSVG()).svg, depth, path });
    }
    return { svg, subs };
  } finally {
    try { viewer.destroy(); } catch { /* abaikan */ }
    wadah.remove();
  }
}
