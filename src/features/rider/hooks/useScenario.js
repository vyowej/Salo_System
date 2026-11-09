import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

export function useScenario(defaultScenario = 'default') {
  const { search } = useLocation();

  return useMemo(() => {
    const params = new URLSearchParams(search);
    const scenario = params.get('scenario');
    return ['default', 'empty', 'loading', 'error'].includes(scenario) ? scenario : defaultScenario;
  }, [defaultScenario, search]);
}

export default useScenario;
