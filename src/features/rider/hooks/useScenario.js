// Supports UI previews: default, empty, loading, error; active previews an assigned delivery, while denied/stale preview map states.
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

export function useScenario(defaultScenario = 'default') {
  const { search } = useLocation();

  return useMemo(() => {
    const params = new URLSearchParams(search);
    const scenario = params.get('scenario');
    const validScenarios = ['default', 'empty', 'loading', 'error', 'active', 'denied', 'stale'];
    return validScenarios.includes(scenario) ? scenario : defaultScenario;
  }, [defaultScenario, search]);
}

export default useScenario;
