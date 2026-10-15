/**
 * OHIF runtime configuration for the VIARA local viewer.
 *
 * Mounted into the ohif/app container at /usr/share/nginx/html/app-config.js
 * (see docker-compose `ohif` service). The single DICOMweb data source uses
 * relative roots so every QIDO/WADO request stays same-origin through the
 * OHIF reverse proxy. The viewer receives a short-lived,
 * study-scoped bearer session before the iframe is opened.
 * Orthanc credentials remain on the backend; scoped tokens live only in the viewer tab.
 */
if (typeof window !== 'undefined') {
  if (typeof window.__filename === 'undefined') {
    window.__filename = '/app.bundle.js';
  }
  if (typeof window.__dirname === 'undefined') {
    window.__dirname = '/';
  }
  if (typeof window.process === 'undefined') {
    window.process = { env: {}, browser: true };
  } else if (!window.process.env) {
    window.process.env = {};
  }
}

try {
  const shownTours = JSON.parse(localStorage.getItem('shownTours') || '[]');
  if (!shownTours.includes('basicViewerTour')) {
    localStorage.setItem('shownTours', JSON.stringify([...shownTours, 'basicViewerTour']));
  }
} catch {
  localStorage.setItem('shownTours', JSON.stringify(['basicViewerTour']));
}

// Credentials travel in the URL fragment (never in HTTP requests or referrers).
const viewerFragment = new URLSearchParams(window.location.hash.slice(1));
const viewerToken = viewerFragment.get('viaraToken');
if (viewerToken) {
  sessionStorage.setItem('VIARA_viewer_token', viewerToken);
  history.replaceState(null, '', window.location.pathname + window.location.search);
}
const parentOrigin = viewerFragment.get('parentOrigin');
const notifyParent = (state, message = '') => {
  if (window.parent !== window && parentOrigin) {
    window.parent.postMessage({ type: 'viara:viewer-status', state, message }, parentOrigin);
  }
};
let imageRendered = false;
document.addEventListener('CORNERSTONE_IMAGE_RENDERED', () => {
  imageRendered = true;
  window.__viaraImageRendered = true;
  notifyParent('ready');
}, true);
window.addEventListener('unhandledrejection' , (event) => {
  if (event.reason?.name === 'AbortError') { event.preventDefault(); return; }
  notifyParent('error', 'The viewer could not load imaging data.');
});
window.addEventListener('load', async () => {
  try {
    const uid = new URLSearchParams(location.search).get('StudyInstanceUIDs')?.split(',')[0];
    if (!uid) throw new Error('No imaging study selected');
    const token = sessionStorage.getItem('VIARA_viewer_token');
    const response = await fetch('/api/pacs/dicom-web/studies/' + encodeURIComponent(uid) + '/metadata', {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      signal: AbortSignal.timeout(30000), cache: 'no-store'
    });
    if (!response.ok) throw new Error('Imaging request failed (' + response.status + ')');
    const data = await response.json();
    if (!Array.isArray(data) || !data.length) throw new Error('No images are available in this study');
    window.setTimeout(() => { if (!imageRendered) notifyParent('error', 'Imaging metadata loaded but no image could be rendered.'); }, 45000);
  } catch (error) { notifyParent('error', error.message); }
});

// A detached viewer renews only its existing scope, bounded by the parent login expiry.
if (window.parent === window) {
  window.setInterval(async () => {
    try {
      const token = sessionStorage.getItem('VIARA_viewer_token');
      const csrf = document.cookie.split('; ').find(value => value.startsWith('csrf_token='))?.slice(11);
      const response = await fetch('/api/pacs/viewer-renew', { method: 'POST', headers: { Authorization: 'Bearer ' + token, ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}) }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Viewer session renewal failed');
      sessionStorage.setItem('VIARA_viewer_token', (await response.json()).viewerToken);
    } catch { sessionStorage.removeItem('VIARA_viewer_token'); }
  }, 8 * 60 * 1000);
}
window.addEventListener('message', event => {
  if (event.origin !== parentOrigin || event.source !== window.parent || event.data?.type !== 'viara:viewer-token') return;
  if (typeof event.data.token === 'string') sessionStorage.setItem('VIARA_viewer_token', event.data.token);
});

window.config = ({ servicesManager, extensionManager }) => {
  return {
  routerBasename: window.location.pathname.startsWith('/pacs-viewer/') ? '/pacs-viewer/' : '/',
  showStudyList: false,
  investigationalUseDialog: { option: 'never' },
  whiteLabeling: {
    createLogoComponentFn: function (React) {
      return React.createElement(
        'div',
        { className: 'flex items-center gap-2 text-white' },
        React.createElement(
          'span',
          { className: 'bg-primary-main flex h-7 w-7 items-center justify-center rounded text-xs font-bold' },
          'R'
        ),
        React.createElement(
          'span',
          { className: 'hidden text-sm font-semibold sm:block' },
          'VIARA Imaging'
        )
      );
    },
  },
  extensions: [],
  modes: [],
  useSharedArrayBuffer: 'FALSE',
  maxNumberOfWebWorkers: 3,
  showLoadingIndicator: true,
  showCPUFallbackMessage: true,
  showWarningMessageForCrossOrigin: false,
  strictZSpacingForVolumeViewport: true,
  groupEnabledModesFirst: true,
  maxNumRequests: {
    interaction: 10,
    thumbnail: 4,
    prefetch: 2,
  },
  studyPrefetcher: {
    enabled: true,
    displaySetsCount: 1,
    maxNumPrefetchRequests: 2,
    order: 'closest',
  },
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        onConfiguration: dicomWebConfig => {
  servicesManager.services.userAuthenticationService.setServiceImplementation({
    getAuthorizationHeader: () => {
      const token = sessionStorage.getItem('VIARA_viewer_token');
      return token ? { Authorization: 'Bearer ' + token } : {};
    },
    handleUnauthenticated: () => notifyParent('error', 'Your imaging session expired. Reopen the viewer.'),
  });
          if (!document.getElementById('viara-measurement-bridge')) {
            const script = document.createElement('script');
            script.id = 'viara-measurement-bridge'; script.src = (location.pathname.startsWith('/pacs-viewer/') ? '/pacs-viewer/' : '/') + 'viara-measurements.js';
            script.onload = () => window.VIARA_initMeasurementDrafts({ servicesManager, extensionManager });
            script.onerror = () => notifyParent('error', 'Measurement drafts are unavailable. Reload the viewer.');
            document.head.appendChild(script);
          }
          return dicomWebConfig;
        },
        friendlyName: 'VIARA PACS',
        name: 'VIARA',
        qidoRoot: '/api/pacs/dicom-web',
        wadoRoot: '/api/pacs/dicom-web',
        wadoUriRoot: '/api/pacs/dicom-web',
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        qidoSupportsIncludeField: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        supportsReject: false,
        dicomUploadEnabled: false,
        omitQuotationForMultipartRequest: true,
      },

    },
  ],
  defaultDataSourceName: 'dicomweb',
};
};
