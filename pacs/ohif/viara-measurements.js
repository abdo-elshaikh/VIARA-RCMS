// Personal reader drafts. These annotations do not finalize or sign a clinical report.
window.VIARA_initMeasurementDrafts = ({ servicesManager }) => {
  if (window.__viaraDraftsStarted) return;
  window.__viaraDraftsStarted = true;
  const { measurementService, displaySetService, cornerstoneViewportService } = servicesManager.services;
  const FORMAT = 'viara-ohif-measurements-v1';
  const supportedTools = new Set(['Length', 'Bidirectional', 'Angle', 'CobbAngle', 'EllipticalROI', 'CircleROI', 'RectangleROI', 'ArrowAnnotate', 'Probe']);
  const studies = new URLSearchParams(location.search).get('StudyInstanceUIDs')?.split(',').filter(Boolean) || [];
  const states = new Map(studies.map(uid => [uid, { version: 0, loaded: false, pending: new Map(), restored: new Set() }]));
  let dirty = false, saving = false, blocked = false, suspended = false, restoreDepth = 0, revision = 0, timer, loadPromise;
  const controller = new AbortController();
  const badge = document.createElement('div');
  badge.setAttribute('role', 'status');
  Object.assign(badge.style, { position: 'fixed', bottom: '8px', left: '8px', zIndex: '9999', maxWidth: '460px',
    padding: '5px 10px', borderRadius: '6px', background: '#0f172aee', color: '#cbd5e1', font: '12px sans-serif', pointerEvents: 'none' });
  const ar = new URLSearchParams(location.search).get('lang') === 'ar';
  const messages = ar ? {
    loading: 'جارٍ تحميل القياسات الشخصية…', saving: 'جارٍ حفظ القياسات الشخصية…', saved: 'تم حفظ القياسات كمسودة شخصية',
    error: 'لم تُحفظ القياسات. أعد فتح الدراسة قبل المتابعة.', conflict: 'تغيّرت القياسات في نافذة أخرى. أعد تحميل الدراسة.',
    unsupported: 'بعض أدوات التعليق تتطلب التصدير من OHIF لحفظها.'
  } : {
    loading: 'Loading personal measurement drafts…', saving: 'Saving personal measurement drafts…', saved: 'Personal measurement draft saved',
    error: 'Measurements are not saved. Reopen the study before continuing.', conflict: 'Measurements changed in another window. Reload this study.',
    unsupported: 'Some annotation tools require an OHIF export to preserve them.'
  };
  const status = value => { badge.textContent = messages[value]; badge.style.color = ['error', 'conflict', 'unsupported'].includes(value) ? '#fcd34d' : '#cbd5e1'; };
  status('loading'); document.body.appendChild(badge);
  const request = async (uid, options = {}) => {
    const token = sessionStorage.getItem('VIARA_viewer_token');
    const csrf = document.cookie.split('; ').find(value => value.startsWith('csrf_token='))?.slice(11);
    const response = await fetch('/api/pacs/viewer-state/' + encodeURIComponent(uid) + '/measurements', {
      ...options, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), cache: 'no-store', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}) }
    });
    if (!response.ok) throw Object.assign(new Error('Measurement draft request failed'), { status: response.status });
    return response.json();
  };
  const serializable = value => JSON.parse(JSON.stringify(value));
  const sourceFor = m => measurementService.getSource('Cornerstone3DTools', '0.1');
  const snapshot = m => {
    if (!supportedTools.has(m.toolName) || !Array.isArray(m.points) || !m.points.length || !m.SOPInstanceUID || !m.referenceSeriesUID) return null;
    const { source, getReport, ...measurement } = m;
    let annotation = measurementService.getAnnotation(sourceFor(m), m.toolName, m.uid);
    if (!annotation?.data?.handles) annotation = { annotationUID: m.uid, metadata: { ...m.metadata, toolName: m.toolName },
      data: { handles: { points: m.points, textBox: m.textBox }, cachedStats: m.cachedStats || m.data || {}, label: m.label || '', text: m.label || '', frameNumber: m.frameNumber || 1 } };
    measurement.frameNumber = Number(m.frameNumber || 1);
    return serializable({ measurement, annotation });
  };
  const restoreAvailable = () => {
    if (suspended || blocked) return;
    const source = measurementService.getSource('Cornerstone3DTools', '0.1');
    if (!source) return;
    const mappings = measurementService.getSourceMappings('Cornerstone3DTools', '0.1');
    restoreDepth++;
    try {
      for (const state of states.values()) for (const [uid, entry] of state.pending) {
        if (state.restored.has(uid) || measurementService.getMeasurement(uid)) { state.restored.add(uid); continue; }
        const m = entry.measurement;
        const displaySet = displaySetService.getDisplaySetForSOPInstanceUID(m.SOPInstanceUID, m.referenceSeriesUID);
        const instance = displaySet?.instances?.find(image => image.SOPInstanceUID === m.SOPInstanceUID);
        const mapping = mappings?.find(value => value.annotationType === m.toolName);
        if (!instance || !mapping) continue; // Lazy series are restored when their display set becomes available.
        // OHIF stores the same registered WADO image identifier on each instance.
        // getImageIdsForInstance returns a string in this release, not an array.
        const imageId = typeof instance.imageId === 'string'
          ? instance.imageId.replace(/\/frames\/\d+$/, '/frames/' + m.frameNumber) : null;
        if (!imageId) continue;
        const annotation = serializable(entry.annotation);
        annotation.annotationUID = uid;
        annotation.metadata = { ...annotation.metadata, referencedImageId: imageId, toolName: m.toolName };
        const viewport = cornerstoneViewportService.getRenderingEngine()?.getViewports().find(view => view.getCurrentImageId?.() === imageId);
        annotation.metadata.FrameOfReferenceUID = instance.FrameOfReferenceUID || viewport?.getFrameOfReferenceUID?.() || m.FrameOfReferenceUID;
        const added = measurementService.addRawMeasurement(source, m.toolName, { uid, annotation }, mapping.toMeasurementSchema);
        if (added) state.restored.add(uid);
      }
    } finally { restoreDepth--; }
  };
  const load = async () => {
    await Promise.all(studies.map(async uid => {
      const data = await request(uid);
      if (data.format !== FORMAT) throw new Error('Unsupported draft version');
      const state = states.get(uid);
      state.version = data.version;
      state.pending = new Map(data.measurements.map(entry => [entry.measurement.uid, entry]));
      state.loaded = true;
    }));
    restoreAvailable();
    if (dirty) scheduleSave(); else status('saved');
  };
  const save = async () => {
    if (!dirty || blocked || suspended || saving || ![...states.values()].every(state => state.loaded)) return;
    saving = true; dirty = false; const saveRevision = revision; status('saving');
    let unsupported = false;
    try {
      for (const [uid, state] of states) {
        const entries = new Map([...state.pending].filter(([id]) => !state.restored.has(id)));
        for (const m of measurementService.getMeasurements(m => m.referenceStudyUID === uid)) {
          const entry = snapshot(m);
          if (entry) entries.set(m.uid, entry); else unsupported = true;
        }
        const data = await request(uid, { method: 'PUT', body: JSON.stringify({ format: FORMAT, version: state.version, measurements: [...entries.values()] }) });
        state.version = data.version;
        if (revision === saveRevision) state.pending = entries;
      }
      status(unsupported ? 'unsupported' : 'saved');
    } catch (error) {
      dirty = true; blocked = true;
      status(error.status === 409 ? 'conflict' : 'error');
    } finally { saving = false; if (dirty && !blocked) scheduleSave(); }
  };
  const scheduleSave = () => { clearTimeout(timer); timer = setTimeout(save, 750); };
  const changed = () => {
    if (restoreDepth || suspended) return;
    dirty = true; revision++; scheduleSave();
  };
  for (const name of ['MEASUREMENT_ADDED', 'MEASUREMENT_UPDATED', 'MEASUREMENT_REMOVED', 'MEASUREMENTS_CLEARED']) measurementService.subscribe(measurementService.EVENTS[name], changed);
  // OHIF clears its runtime state on mode exit; that cleanup must not delete durable drafts.
  const exit = measurementService.onModeExit.bind(measurementService);
  measurementService.onModeExit = () => {
    for (const [uid, state] of states) {
      const entries = new Map([...state.pending].filter(([id]) => !state.restored.has(id)));
      for (const m of measurementService.getMeasurements(m => m.referenceStudyUID === uid)) {
        const entry = snapshot(m); if (entry) entries.set(m.uid, entry);
      }
      state.pending = entries;
      state.restored.clear();
    }
    suspended = true;
    try { return exit(); } finally { suspended = false; }
  };
  const onRender = () => {
    if (!loadPromise) loadPromise = load().catch(() => { blocked = true; status('error'); });
    else { try { restoreAvailable(); } catch { blocked = true; status('error'); } }
  };
  document.addEventListener('CORNERSTONE_IMAGE_RENDERED', onRender, true);
  if (window.__viaraImageRendered) onRender();
  window.addEventListener('beforeunload', event => {
    if (dirty || saving) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('pagehide', () => { suspended = true; clearTimeout(timer); controller.abort(); });
};
