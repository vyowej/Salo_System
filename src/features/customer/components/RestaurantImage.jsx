import { useEffect, useState } from 'react';
import restaurantService from '../../../services/restaurantService';

export default function RestaurantImage({ image, alt, fallback = '', className, style }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let active = true;
    if (image?.id) {
      restaurantService.getImageUrl(image).then((url) => {
        if (active) setSrc(url || '');
      }).catch(() => {
        if (active) setSrc('');
      });
    } else {
      setSrc(typeof image === 'string' && /^(https?:|data:|blob:)/.test(image) ? image : image?.src || '');
    }

    return () => {
      active = false;
    };
  }, [image]);

  if (src) {
    return <img className={className} src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }} />;
  }

  return (
    <span
      className={className}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}
    >
      {fallback || (typeof image === 'string' ? image : '')}
    </span>
  );
}
