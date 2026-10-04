import React, { Suspense, lazy } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentUser, selectIsAuthenticated } from '../store/authSlice';
import ReceptionErrorState from '../components/reception/ReceptionErrorState';
import ReceptionLoadingState from '../components/reception/ReceptionLoadingState';
import { isCashierRole } from '../utils/permissions';

// Load only the workspace required by the signed-in role.
// CashierWorkspace and ReceptionOperations are both large operational screens;
// keeping them out of the initial bundle improves time-to-interactive noticeably.
const CashierWorkspace = lazy(() => import('./CashierWorkspace'));
const ReceptionOperations = lazy(() => import('../components/reception/ReceptionOperations'));

const Reception = () => {
  const { t } = useTranslation('reception');
  const user = useSelector(selectCurrentUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);

  if (!isAuthenticated) {
    return (
      <ReceptionErrorState
        message={t('states.loginRequired')}
        onRetry={() => (window.location.href = '/login')}
      />
    );
  }

  if (!user) {
    return (
      <ReceptionErrorState
        message={t('states.profileMissing')}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const Workspace = isCashierRole(user) ? CashierWorkspace : ReceptionOperations;

  return (
    <Suspense fallback={<ReceptionLoadingState message={t('states.loading')} />}>
      <Workspace />
    </Suspense>
  );
};

export default Reception;
