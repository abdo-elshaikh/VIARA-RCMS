import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Note: Recharts needs to be installed via `npm install recharts`
// This component assumes the data format matches the backend report output

const FinancialChart = ({ data }) => {
    if (!data || data.length === 0) {
        return <div className="p-4 text-center text-gray-500">No Data Available</div>;
    }

    return (
        <div className="h-64 w-full bg-white p-4 rounded shadow">
            <h3 className="text-lg font-bold mb-4 text-gray-700">Revenue Overview</h3>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    margin={{
                        top: 5,
                        right: 30,
                        left: 20,
                        bottom: 5,
                    }}
                >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total_revenue" fill="#8884d8" name="Total Revenue" />
                    <Bar dataKey="insurance_claimable" fill="#82ca9d" name="Insurance Claims" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default FinancialChart;
