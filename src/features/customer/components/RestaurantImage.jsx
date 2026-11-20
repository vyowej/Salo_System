import { useEffect, useState } from 'react';
import { resolvePublicStorageUrl } from '../../../services/restaurantService';

export default function RestaurantImage({
  image,
  alt,
  fallback = '',
  fallbackSrc = '',
  className,
  style,
}) {
  const [src, setSrc] = useState('');
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);

    if (typeof image === 'string') {
      const trimmed = image.trim();
      const isUrlOrPath = /^(https?:|data:|blob:|\/)/i.test(trimmed) || /^(restaurants|users|riders|promotions)\//i.test(trimmed);
      setSrc(isUrlOrPath ? resolvePublicStorageUrl(trimmed) : '');
    } else if (image && (image.src || image.url || image.path)) {
      setSrc(resolvePublicStorageUrl(image));
    } else {
      setSrc('');
    }
  }, [image]);

  const effectiveSrc = !imgFailed && src ? src : fallbackSrc;

  if (effectiveSrc) {
    return (
      <img
        className={className}
        src={effectiveSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => {
          if (src && effectiveSrc === src) {
            setImgFailed(true);
          }
        }}
        style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }}
      />
    );
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
