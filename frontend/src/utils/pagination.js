export const getPaginationState = (totalItems, requestedPage = 1, requestedPageSize = 20) => {
    const total = Number.isFinite(totalItems) ? Math.max(0, Math.floor(totalItems)) : 0;
    const pageSize = Number.isFinite(requestedPageSize) && requestedPageSize > 0
        ? Math.floor(requestedPageSize)
        : 20;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const normalizedPage = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1;
    const currentPage = Math.min(pageCount, Math.max(1, normalizedPage));
    const startIndex = (currentPage - 1) * pageSize;

    return {
        currentPage,
        pageCount,
        pageSize,
        startIndex,
        endIndex: Math.min(startIndex + pageSize, total),
    };
};
