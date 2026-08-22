import '@testing-library/jest-dom';

class IntersectionObserverMock {
    constructor(callback, options = {}) {
        this.callback = callback;
        this.root = options.root || null;
        this.rootMargin = options.rootMargin || '0px';
        this.thresholds = Array.isArray(options.threshold) ? options.threshold : [options.threshold ?? 0];
        this.targets = new Set();
    }

    observe(target) {
        this.targets.add(target);
        this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }], this);
    }

    unobserve(target) {
        this.targets.delete(target);
    }

    disconnect() {
        this.targets.clear();
    }

    takeRecords() {
        return [];
    }
}

if (!globalThis.IntersectionObserver) {
    globalThis.IntersectionObserver = IntersectionObserverMock;
}
