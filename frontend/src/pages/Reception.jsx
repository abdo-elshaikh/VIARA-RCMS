import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentUser, selectIsAuthenticated } from '../store/authSlice';
import CashierWorkspace from './CashierWorkspace';
import ReceptionOperations from '../components/reception/ReceptionOperations';
import ReceptionErrorState from '../components/reception/ReceptionErrorState';
import { isCashierRole } from '../utils/permissions';

const Reception = () => {
  const { t } = useTranslation('reception');
  const user = useSelector(selectCurrentUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);

  // Memoize the permission check to prevent unnecessary re-renders
  const isUserCashier = useMemo(() => isCashierRole(user), [user]);

  // Handle unauthenticated state
  if (!isAuthenticated) {
    return <ReceptionErrorState 
      message={t('states.loginRequired')}
      onRetry={() => (window.location.href = '/login')} 
    />;
  }

  // Handle missing user (edge case)
  if (!user) {
    return <ReceptionErrorState 
      message={t('states.profileMissing')}
      onRetry={() => window.location.reload()} 
    />;
  }

  // Main content: render appropriate workspace based on role
  return isUserCashier ? <CashierWorkspace /> : <ReceptionOperations />;
};

export default Reception;
