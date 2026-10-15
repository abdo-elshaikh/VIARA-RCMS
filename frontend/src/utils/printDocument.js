const waitForImages = async (documentRef) => {
    const images = Array.from(documentRef?.images || []);
    await Promise.all(images.map((image) => {
        if (image.complete) return image.decode?.().catch(() => undefined);
        return new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
        });
    }));
};

export const printWhenReady = async (windowRef = window) => {
    const documentRef = windowRef?.document;
    await Promise.all([
        documentRef?.fonts?.ready?.catch?.(() => undefined),
        waitForImages(documentRef),
    ]);
    windowRef?.focus?.();
    windowRef?.print?.();
};

export const openPrintDocument = (html, windowRef = window) => {
    // noopener in window.open deliberately returns null in modern browsers.
    // Keep the new window handle, then detach its opener before writing HTML.
    const printWindow = windowRef.open('', '_blank');
    if (!printWindow) return null;
    printWindow.opener = null;
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => { void printWhenReady(printWindow); }, 350);
    return printWindow;
};

export const getSheetPreviewVariables = ({ width, height }) => ({
    '--print-page-width': width,
    '--print-page-aspect': `${parseFloat(width) || 1} / ${parseFloat(height) || 1}`,
});
