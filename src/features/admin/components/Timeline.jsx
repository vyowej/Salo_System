import { formatDateTime } from '../utils/format';
import './AdminComponents.css';

export default function Timeline({ items = [] }) {
  if (!items.length) return <p>No history recorded.</p>;
  return (
    <ol className="admin-timeline">
      {items.map((item, index) => (
        <li className="admin-timeline__item" key={item.id ?? index}>
          <strong>{item.title}</strong>
          {item.description && <p>{item.description}</p>}
          {item.time && <time dateTime={item.time}>{formatDateTime(item.time)}</time>}
        </li>
      ))}
    </ol>
  );
}
