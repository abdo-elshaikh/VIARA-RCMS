/* eslint-disable no-undef */
import { render, screen } from '@testing-library/react';
import AccessibleChartData from '../AccessibleChartData';

describe('AccessibleChartData', () => {
    it('ties a chart summary and disclosed semantic table to the visual chart', () => {
        render(
            <AccessibleChartData
                title="Weekly volume"
                summary="Two weekly volume data points."
                rows={[{ day: 'Monday', value: 12 }, { day: 'Tuesday', value: 18 }]}
                columns={[{ key: 'day', label: 'Day' }, { key: 'value', label: 'Scans', render: row => `${row.value} scans` }]}
                disclosureLabel="View chart data"
            >
                <div>visual chart</div>
            </AccessibleChartData>
        );

        const chart = screen.getByRole('img', { name: 'Weekly volume' });
        const description = document.getElementById(chart.getAttribute('aria-describedby'));
        expect(description).toHaveTextContent('Two weekly volume data points.');
        expect(screen.getByText('View chart data').closest('details')).not.toHaveAttribute('open');
        expect(screen.getByRole('table', { name: 'Weekly volume' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Scans' })).toBeInTheDocument();
        expect(screen.getByText('18 scans')).toBeInTheDocument();
    });
});
