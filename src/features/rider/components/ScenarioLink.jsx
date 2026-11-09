import { Link, useLocation } from 'react-router-dom';
import { withScenario } from '../utils/scenarioLinks';

export default function ScenarioLink({ to, ...props }) {
  const { search } = useLocation();

  return <Link to={withScenario(to, search)} {...props} />;
}
