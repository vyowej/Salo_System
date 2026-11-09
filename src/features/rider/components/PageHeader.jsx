import { RiderPageHeading } from './RiderUI';

export default function PageHeader({ title, subtitle, eyebrow, actions }) {
  return (
    <RiderPageHeading
      eyebrow={eyebrow}
      title={title}
      description={subtitle}
      actions={actions}
    />
  );
}
