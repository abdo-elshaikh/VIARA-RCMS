/* eslint-disable no-undef */
import { getPaginationState } from '../pagination';

describe('pagination state', () => {
    it('calculates page boundaries for a partial final page', () => {
        expect(getPaginationState(63, 3, 20)).toEqual({
            currentPage: 3,
            pageCount: 4,
            pageSize: 20,
            startIndex: 40,
            endIndex: 60,
        });
    });

    it('clamps pages after a filtered result set shrinks', () => {
        expect(getPaginationState(7, 5, 20)).toMatchObject({
            currentPage: 1,
            pageCount: 1,
            startIndex: 0,
            endIndex: 7,
        });
    });

    it('keeps empty result sets on a stable first page', () => {
        expect(getPaginationState(0, -2, 0)).toEqual({
            currentPage: 1,
            pageCount: 1,
            pageSize: 20,
            startIndex: 0,
            endIndex: 0,
        });
    });
});
