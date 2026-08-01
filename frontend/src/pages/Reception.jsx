import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectCurrentUser, selectIsAuthenticated } from '../store/authSlice';
import CashierWorkspace from './CashierWorkspace';
import ReceptionOperations from '../components/reception/ReceptionOperations';
import ReceptionLoadingState from '../components/reception/ReceptionLoadingState';
import ReceptionErrorState from '../components/reception/ReceptionErrorState';
import { isCashierRole } from '../utils/permissions';

const Reception = () => {
  const dispatch = useDispatch();
  const user = useSelector(selectCurrentUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initializeReception = async () => {
      try {
        setError(null);
      } catch (err) {
        setError(err.message || 'Failed to initialize reception state');
      } finally {
        setIsInitializing(false);
      }
    };

    initializeReception();
  }, [dispatch, isAuthenticated]);

  // Memoize the permission check to prevent unnecessary re-renders
  const isUserCashier = useMemo(() => isCashierRole(user), [user]);

  // Handle loading state during initialization
  if (isInitializing) {
    return <ReceptionLoadingState message="Loading reception interface..." />;
  }

  // Handle error state with user-friendly message
  if (error) {
    return <ReceptionErrorState message={error} onRetry={() => window.location.reload()} />;
  }

  // Handle unauthenticated state
  if (!isAuthenticated) {
    return <ReceptionErrorState 
      message="Please log in to access reception" 
      onRetry={() => (window.location.href = '/login')} 
    />;
  }

  // Handle missing user (edge case)
  if (!user) {
    return <ReceptionErrorState 
      message="User profile not found. Please contact support." 
      onRetry={() => window.location.reload()} 
    />;
  }

  // Main content: render appropriate workspace based on role
  return isUserCashier ? <CashierWorkspace /> : <ReceptionOperations />;
};

export default Reception;
