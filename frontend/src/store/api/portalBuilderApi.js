import { api } from '../baseApi';

export const portalBuilderApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPortalBuilder: builder.query({ query: () => '/settings/portal' }),
    getPortalVersions: builder.query({ query: () => '/settings/portal/versions' }),
    savePortalDraft: builder.mutation({
      query: (body) => ({ url: '/settings/portal/draft', method: 'PUT', body }),
    }),
    publishPortal: builder.mutation({
      query: (body) => ({ url: '/settings/portal/publish', method: 'POST', body }),
    }),
    restorePortal: builder.mutation({
      query: (body) => ({ url: '/settings/portal/restore', method: 'POST', body }),
    }),
    previewPortal: builder.mutation({
      query: (body) => ({ url: '/settings/portal/preview-session', method: 'POST', body }),
    }),
  }),
});
export const {
  useGetPortalBuilderQuery,
  useGetPortalVersionsQuery,
  useSavePortalDraftMutation,
  usePublishPortalMutation,
  useRestorePortalMutation,
  usePreviewPortalMutation,
} = portalBuilderApi;
