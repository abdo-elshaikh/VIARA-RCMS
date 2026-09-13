import { api } from '../baseApi';

export const inventoryApi = api.injectEndpoints({
    endpoints: (builder) => ({
        getSuppliers: builder.query({
            query: (params) => ({ url: '/suppliers', params }),
            providesTags: ['Suppliers'],
        }),
        getSupplierById: builder.query({
            query: (id) => `/suppliers/${id}`,
            providesTags: (result, error, id) => [{ type: 'Suppliers', id }],
        }),
        createSupplier: builder.mutation({
            query: (data) => ({ url: '/suppliers', method: 'POST', body: data }),
            invalidatesTags: ['Suppliers'],
        }),
        updateSupplier: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/suppliers/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Suppliers'],
        }),
        getPurchaseOrders: builder.query({
            query: (params) => ({ url: '/purchase-orders', params }),
            providesTags: ['PurchaseOrders'],
        }),
        getPurchaseOrderById: builder.query({
            query: (id) => `/purchase-orders/${id}`,
            providesTags: (result, error, id) => [{ type: 'PurchaseOrders', id }],
        }),
        createPurchaseOrder: builder.mutation({
            query: (data) => ({ url: '/purchase-orders', method: 'POST', body: data }),
            invalidatesTags: ['PurchaseOrders'],
        }),
        updatePurchaseOrderStatus: builder.mutation({
            query: ({ id, status }) => ({ url: `/purchase-orders/${id}/status`, method: 'PUT', body: { status } }),
            invalidatesTags: ['PurchaseOrders'],
        }),
        receiveStock: builder.mutation({
            query: ({ id, items }) => ({ url: `/purchase-orders/${id}/receive`, method: 'POST', body: { items } }),
            invalidatesTags: ['PurchaseOrders', 'Inventory', 'StockMovements'],
        }),
        getInventory: builder.query({
            query: () => '/inventory',
            providesTags: ['Inventory'],
        }),
        addItem: builder.mutation({
            query: (data) => ({
                url: '/inventory',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Inventory'],
        }),
        updateStock: builder.mutation({
            query: ({ itemId, ...data }) => ({
                url: `/inventory/${itemId}`,
                method: 'PUT',
                body: data,
            }),
            invalidatesTags: ['Inventory'],
        }),
        consumeStock: builder.mutation({
            query: (data) => ({ url: '/inventory/consume', method: 'POST', body: data }),
            invalidatesTags: ['Inventory', 'StockMovements', 'Invoices', 'Queue', 'Appointments'],
        }),
        adjustStock: builder.mutation({
            query: (data) => ({ url: '/inventory/adjust', method: 'POST', body: data }),
            invalidatesTags: ['Inventory', 'StockMovements'],
        }),
        getStockMovements: builder.query({
            query: (params) => ({ url: '/inventory/movements', params }),
            providesTags: ['StockMovements'],
        }),
        getExpiryAlerts: builder.query({
            query: () => '/inventory/expiry-alerts',
            providesTags: ['Inventory'],
        }),
        getMachines: builder.query({
            query: () => '/machines',
            providesTags: ['Machines'],
        }),
        createMachine: builder.mutation({
            query: (data) => ({ url: '/machines', method: 'POST', body: data }),
            invalidatesTags: ['Machines', 'ExamTypes', 'ScheduleAvailability', 'PacsAudit'],
        }),
        getMachineById: builder.query({
            query: (id) => `/machines/${id}`,
            providesTags: (result, error, id) => [{ type: 'Machines', id }],
        }),
        updateMachine: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/machines/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Machines', 'ExamTypes', 'ScheduleAvailability'],
        }),
        deleteMachine: builder.mutation({
            query: (id) => ({ url: `/machines/${id}`, method: 'DELETE' }),
            invalidatesTags: ['Machines', 'ExamTypes', 'ScheduleAvailability'],
        }),
        getModalities: builder.query({
            query: () => '/machines',
        }),
        getUtilizationReport: builder.query({
            query: (params) => ({ url: '/machines/utilization', params }),
            providesTags: ['Machines', 'EquipmentDowntime'],
        }),
        getServiceContracts: builder.query({
            query: (params) => ({ url: '/equipment/contracts', params }),
            providesTags: ['ServiceContracts'],
        }),
        createServiceContract: builder.mutation({
            query: (data) => ({ url: '/equipment/contracts', method: 'POST', body: data }),
            invalidatesTags: ['ServiceContracts'],
        }),
        updateServiceContract: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/equipment/contracts/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['ServiceContracts'],
        }),
        getEquipmentMaintenance: builder.query({
            query: (params) => ({ url: '/equipment/maintenance', params }),
            providesTags: ['EquipmentMaintenance'],
        }),
        createEquipmentMaintenance: builder.mutation({
            query: (data) => ({ url: '/equipment/maintenance', method: 'POST', body: data }),
            invalidatesTags: ['EquipmentMaintenance'],
        }),
        updateEquipmentMaintenance: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/equipment/maintenance/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['EquipmentMaintenance'],
        }),
        getEquipmentDowntime: builder.query({
            query: (params) => ({ url: '/equipment/downtime', params }),
            providesTags: ['EquipmentDowntime'],
        }),
        createEquipmentDowntime: builder.mutation({
            query: (data) => ({ url: '/equipment/downtime', method: 'POST', body: data }),
            invalidatesTags: ['EquipmentDowntime', 'Machines'],
        }),
        updateEquipmentDowntime: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/equipment/downtime/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['EquipmentDowntime', 'Machines'],
        }),
        getEquipmentUtilization: builder.query({
            query: (params) => ({ url: '/v1/analytics/equipment-utilization', params }),
            providesTags: ['Analytics'],
        }),
    }),
    overrideExisting: false,
});
