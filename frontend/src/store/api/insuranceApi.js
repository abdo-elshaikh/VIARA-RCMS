import { api } from '../baseApi';
import { generateUUID } from '../../utils/uuid';

export const insuranceApi = api.injectEndpoints({
    endpoints: (builder) => ({
        getInsuranceProviders: builder.query({
            query: () => '/insurance/providers',
            providesTags: ['Insurance'],
        }),
        createInsuranceProvider: builder.mutation({
            query: (data) => ({
                url: '/insurance/providers',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Insurance'],
        }),
        updateInsuranceProvider: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/insurance/providers/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Insurance'],
        }),
        getInsuranceContracts: builder.query({
            query: () => '/insurance/contracts',
            providesTags: ['Insurance'],
        }),
        createInsuranceContract: builder.mutation({
            query: (data) => ({
                url: '/insurance/contracts',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Insurance'],
        }),
        updateInsuranceContract: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/insurance/contracts/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Insurance'],
        }),
        getInsurancePolicies: builder.query({
            query: (params) => ({
                url: '/insurance/policies',
                params,
            }),
            providesTags: ['Insurance'],
        }),
        createInsurancePolicy: builder.mutation({
            query: (data) => ({
                url: '/insurance/policies',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Insurance'],
        }),
        updateInsurancePolicy: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/insurance/policies/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Insurance'],
        }),
        getCoverageRules: builder.query({
            query: () => '/insurance/coverage-rules',
            providesTags: ['Insurance'],
        }),
        createCoverageRule: builder.mutation({
            query: (data) => ({
                url: '/insurance/coverage-rules',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Insurance'],
        }),
        updateCoverageRule: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/insurance/coverage-rules/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Insurance'],
        }),
        previewCoverage: builder.query({
            query: (params) => ({
                url: '/insurance/coverage-preview',
                params,
            }),
        }),
        getInsuranceApprovals: builder.query({
            query: () => '/insurance/approvals',
            providesTags: ['Insurance'],
        }),
        createInsuranceApproval: builder.mutation({
            query: (data) => ({
                url: '/insurance/approvals',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Insurance'],
        }),
        updateInsuranceApprovalStatus: builder.mutation({
            query: ({ id, ...body }) => ({
                url: `/insurance/approvals/${id}/status`,
                method: 'PUT',
                body,
            }),
            invalidatesTags: ['Insurance'],
        }),
        getClaims: builder.query({
            query: (params) => ({
                url: '/claims',
                params,
            }),
            providesTags: ['Claims'],
        }),
        createClaim: builder.mutation({
            query: (data) => ({
                url: '/claims',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Claims', 'FinancialReports'],
        }),
        updateClaimStatus: builder.mutation({
            query: ({ id, idempotencyKey = generateUUID(), ...data }) => ({
                url: `/claims/${id}/status`,
                method: 'PUT',
                body: data,
                headers: { 'Idempotency-Key': idempotencyKey },
            }),
            invalidatesTags: ['Claims', 'FinancialReports'],
        }),
        getInsuranceClaimsSummary: builder.query({
            query: (params) => ({
                url: '/insurance/reports/claims-summary',
                params,
            }),
            providesTags: ['Claims'],
        }),
        getPayerStatement: builder.query({
            query: (params) => ({
                url: '/insurance/reports/statement',
                params,
            }),
            providesTags: ['Claims'],
        }),
        getInsuranceAgingReport: builder.query({
            query: (params) => ({
                url: '/insurance/reports/aging',
                params,
            }),
            providesTags: ['Claims'],
        }),
        getContractsPerformanceReport: builder.query({
            query: (params) => ({
                url: '/insurance/reports/contracts-performance',
                params,
            }),
            providesTags: ['Insurance'],
        }),
    }),
    overrideExisting: false,
});
