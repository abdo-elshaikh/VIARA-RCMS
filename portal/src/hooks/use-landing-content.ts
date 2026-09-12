import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGetPublicCenterSettingsQuery, useGetPublicLandingOverviewQuery } from '../store/api';
import {
    usePortalIdentity,
    resolvePortalBranches,
    type PortalBranchSummary,
} from '../lib/portal-identity';

/**
 * Landing-page content gateway.
 *
 * Single source for everything the landing page renders that is a *fact*
 * about the business: real branches (from settings), real active equipment
 * (from the public landing overview), real contact channels, and optional
 * curated content (testimonials / FAQs) managed via homepage_settings.
 *
 * Hard rule implemented here: no fabricated fallbacks. When the backend has
 * no data for something, the value is empty and the section hides itself.
 */

export interface LandingTestimonial {
    name: string;
    role: string;
    quote: string;
    rating?: number;
}

export interface LandingFaq {
    q: string;
    a: string;
}

export interface LandingOverviewModality {
    id: number | string;
    name: string;
    type: string;
}

export interface LandingContent {
    /** Settings query state (identity, contacts, curated content). */
    isLoading: boolean;
    isError: boolean;
    identity: ReturnType<typeof usePortalIdentity>;
    /** Real branches resolved from center settings; empty array = hide section. */
    branches: PortalBranchSummary[];
    /** Real, currently active equipment names; empty array = hide inventory sections. */
    activeModalityNames: string[];
    /** True once the overview loaded (even to an empty list). */
    overviewLoaded: boolean;
    /** True when the overview request failed; sections offer a retry. */
    overviewError: boolean;
    /** Re-run the overview query (used by retry affordances). */
    refetchOverview: () => void;
    overview: {
        studiesToday: number | null;
        activeModalities: number | null;
        completionRate: number | null;
        imagingMinutes: number | null;
        deliveredToday: number | null;
    } | null;
    /** Curated testimonials from homepage_settings; empty = hide section. */
    testimonials: LandingTestimonial[];
    /** Curated FAQs from homepage_settings; empty = use built-in generic guidance. */
    faqs: LandingFaq[];
    /** Real contact channels; empty = the channel must not be rendered. */
    contactPhone: string;
    whatsappNumber: string;
}

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const normalizeTestimonials = (raw: unknown, isRtl: boolean): LandingTestimonial[] => {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((item: any): LandingTestimonial | null => {
            const name = isRtl ? asString(item?.nameAr) || asString(item?.name) : asString(item?.nameEn) || asString(item?.name);
            const quote = isRtl ? asString(item?.quoteAr) || asString(item?.quote) : asString(item?.quoteEn) || asString(item?.quote);
            if (!name || !quote) return null;
            const rating = Number(item?.rating);
            return {
                name,
                role: isRtl ? asString(item?.roleAr) || asString(item?.role) : asString(item?.roleEn) || asString(item?.role),
                quote,
                rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? Math.round(rating) : undefined,
            };
        })
        .filter((item): item is LandingTestimonial => item !== null);
};

const normalizeFaqs = (raw: unknown, isRtl: boolean): LandingFaq[] => {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((item: any): LandingFaq | null => {
            const q = isRtl ? asString(item?.qAr) || asString(item?.q) : asString(item?.qEn) || asString(item?.q);
            const a = isRtl ? asString(item?.aAr) || asString(item?.a) : asString(item?.aEn) || asString(item?.a);
            if (!q || !a) return null;
            return { q, a };
        })
        .filter((item): item is LandingFaq => item !== null);
};

export const useLandingContent = (): LandingContent => {
    const { i18n } = useTranslation();
    const language = i18n.resolvedLanguage || i18n.language || 'en';
    const isRtl = language.split('-')[0] === 'ar';

    const settingsQuery = useGetPublicCenterSettingsQuery();
    const overviewQuery = useGetPublicLandingOverviewQuery();
    const identity = usePortalIdentity();

    const settings = useMemo(() => settingsQuery.data || {}, [settingsQuery.data]);
    const homepage = settings.homepage_settings || {};
    const overview = overviewQuery.data;
    const managedTestimonials = homepage.testimonials;
    const managedFaqs = homepage.faqs;
    const overviewLoaded = overviewQuery.isSuccess;
    const overviewError = overviewQuery.isError;
    const refetchOverview = overviewQuery.refetch;

    return useMemo(() => {
        const modalities: LandingOverviewModality[] = Array.isArray(overview?.modalities)
            ? overview.modalities
            : [];

        const overviewMetrics = overview
            ? {
                  studiesToday: overview.metrics?.studiesToday ?? null,
                  activeModalities: overview.metrics?.activeModalities ?? null,
                  completionRate: overview.metrics?.completionRate ?? null,
                  imagingMinutes: overview.workflow?.imagingMinutes ?? null,
                  deliveredToday: overview.services?.deliveredToday ?? null,
              }
            : null;

        return {
            isLoading: settingsQuery.isLoading,
            isError: settingsQuery.isError,
            identity,
            branches: resolvePortalBranches({ settings, language }),
            activeModalityNames: modalities.map((item) => item.name).filter(Boolean),
            overviewLoaded,
            overviewError,
            refetchOverview: () => {
                void refetchOverview();
            },
            overview: overviewMetrics,
            testimonials: normalizeTestimonials(managedTestimonials, isRtl),
            faqs: normalizeFaqs(managedFaqs, isRtl),
            contactPhone: identity.contacts.hotline || identity.contacts.phone || '',
            whatsappNumber: identity.contacts.whatsapp || '',
        };
    }, [settingsQuery.isLoading, settingsQuery.isError, overviewLoaded, overviewError, refetchOverview, settings, overview, identity, language, isRtl, managedTestimonials, managedFaqs]);
};

/**
 * Case-insensitive keyword match against the real active modality names.
 * Used to keep marketing cards honest: a card is only shown when the center
 * actually operates a matching modality.
 */
export const matchesActiveModalities = (activeNames: string[], keywords: string[]): boolean => {
    if (!activeNames.length) return false;
    const haystack = activeNames.join(' ').toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
};
