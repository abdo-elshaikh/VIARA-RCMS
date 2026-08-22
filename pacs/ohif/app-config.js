/**
 * OHIF runtime configuration for the VIARA local viewer.
 *
 * Mounted into the ohif/app container at /usr/share/nginx/html/app-config.js
 * (see docker-compose `ohif` service). The single DICOMweb data source uses
 * relative roots so every QIDO/WADO request is same-origin to the OHIF
 * container (http://localhost:3005). The viewer receives a short-lived,
 * study-scoped session in an HTTP-only cookie before the iframe is opened.
 * Orthanc and viewer credentials are never exposed to browser JavaScript.
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

// dicomweb-client reports canceled XHRs as a generic `request failed` error
// with status 0. Series changes and request-pool cleanup can cause those
// cancellations during normal use. Prevent the production error overlay for
// that one expected case while preserving real HTTP and offline failures.
window.addEventListener('unhandledrejection', function (event) {
  const reason = event.reason;
  const isCanceledDicomRequest =
    navigator.onLine &&
    reason &&
    reason.message === 'request failed' &&
    Number(reason.status) === 0 &&
    reason.request instanceof XMLHttpRequest;

  if (isCanceledDicomRequest) {
    event.preventDefault();
    // OHIF also listens globally and otherwise presents an error notification
    // for normal request-pool cancellations while switching display sets.
    event.stopImmediatePropagation();
  }
});

window.config = {
  routerBasename: '/',
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
      onConfiguration: (dicomWebConfig, options) => {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        if (token) {
          sessionStorage.setItem('VIARA_viewer_token', token);
          dicomWebConfig.headers = dicomWebConfig.headers || {};
          dicomWebConfig.headers.Authorization = `Bearer ${token}`;
        } else {
          // VIARA uses a same-site, HTTP-only PACS cookie. Never reuse a token
          // left by an older query-string session after the cookie is renewed.
          sessionStorage.removeItem('VIARA_viewer_token');
          if (dicomWebConfig.headers) {
            delete dicomWebConfig.headers.Authorization;
          }
        }

        return dicomWebConfig;
      }
    },
  ],
  defaultDataSourceName: 'dicomweb',
};
