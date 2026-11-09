import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAdminMock } from '../mocks';

export default function useScenario(topic) {
  const [searchParams] = useSearchParams();
  const scenario = searchParams.get('scenario') || 'default';
  const [retryRequested, setRetryRequested] = useState(false);
  const result = getAdminMock(topic, retryRequested ? 'default' : scenario);
  const retry = () => setRetryRequested(true);

  return { ...result, retry };
}
