import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isOnboarded } from '@/features/profile/onboarded';

/** First run only: send people from the dashboard to onboarding (they can skip). */
export function OnboardingGate() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (pathname === '/' && !isOnboarded()) navigate('/onboarding', { replace: true });
  }, [pathname, navigate]);
  return null;
}
