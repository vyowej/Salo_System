import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BrandMark from '../../../components/common/BrandMark';
import { useAuth } from '../../../hooks/useAuth';
import LoginPage from '../../auth/pages/LoginPage';
import RegisterPage from '../../auth/pages/RegisterPage';
import WelcomeModal from '../../auth/components/WelcomeModal';
import AuthShowcaseMiniCard from '../components/AuthShowcaseMiniCard';
import authShowcaseSlides, {
  AUTH_SHOWCASE_CONFIG,
  shouldCarouselAutoplay,
} from '../config/authShowcase.data';
import './LandingPage.css';

export function AuthSlideshow({ initialReducedMotion = false }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [outgoingIndex, setOutgoingIndex] = useState(null);
  const [loadedSlides, setLoadedSlides] = useState(() => new Set([0, 1]));
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusedWithin, setIsFocusedWithin] = useState(false);
  const [isTabHidden, setIsTabHidden] = useState(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false,
  );
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (initialReducedMotion) return true;
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  const touchStartRef = useRef(null);
  const outgoingTimerRef = useRef(null);

  const nextPreloadIndex = (activeIndex + 1) % authShowcaseSlides.length;

  useEffect(() => {
    setLoadedSlides((prev) => {
      if (prev.has(activeIndex) && prev.has(nextPreloadIndex)) return prev;
      const next = new Set(prev);
      next.add(activeIndex);
      next.add(nextPreloadIndex);
      return next;
    });
  }, [activeIndex, nextPreloadIndex]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      setReducedMotion(initialReducedMotion || mediaQuery.matches);
    };
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, [initialReducedMotion]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleVisibilityChange = () => {
      setIsTabHidden(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    return () => {
      if (outgoingTimerRef.current) {
        clearTimeout(outgoingTimerRef.current);
      }
    };
  }, []);

  const showSlide = useCallback(
    (targetIndex) => {
      const nextIndex =
        ((targetIndex % authShowcaseSlides.length) + authShowcaseSlides.length) %
        authShowcaseSlides.length;

      setActiveIndex((currentIndex) => {
        if (nextIndex === currentIndex) return currentIndex;

        if (!reducedMotion && typeof window !== 'undefined') {
          setOutgoingIndex(currentIndex);
          if (outgoingTimerRef.current) {
            window.clearTimeout(outgoingTimerRef.current);
          }
          outgoingTimerRef.current = window.setTimeout(() => {
            setOutgoingIndex(null);
            outgoingTimerRef.current = null;
          }, AUTH_SHOWCASE_CONFIG.textExitDurationMs);
        } else {
          setOutgoingIndex(null);
        }

        return nextIndex;
      });
    },
    [reducedMotion],
  );

  const isAutoplaying = shouldCarouselAutoplay({
    reducedMotion,
    isHovered,
    isFocusedWithin,
    isTabHidden,
  });

  useEffect(() => {
    if (!isAutoplaying || typeof window === 'undefined') return undefined;

    const timer = window.setInterval(() => {
      showSlide(activeIndex + 1);
    }, AUTH_SHOWCASE_CONFIG.autoplayDurationMs);

    return () => window.clearInterval(timer);
  }, [activeIndex, isAutoplaying, showSlide]);

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      showSlide(activeIndex - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      showSlide(activeIndex + 1);
    }
  };

  const handleBlur = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsFocusedWithin(false);
    }
  };

  const handleTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches?.[0];
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        showSlide(activeIndex + 1);
      } else {
        showSlide(activeIndex - 1);
      }
    }
  };

  const activeSlide = authShowcaseSlides[activeIndex];
  const outgoingSlide =
    outgoingIndex !== null && outgoingIndex !== activeIndex
      ? authShowcaseSlides[outgoingIndex]
      : null;

  return (
    <div
      className={`salo-intro-slideshow ${reducedMotion ? 'is-reduced-motion' : ''}`}
      role="region"
      aria-roledescription="carousel"
      aria-label={AUTH_SHOWCASE_CONFIG.carouselAriaLabel}
      aria-live={isAutoplaying ? 'off' : 'polite'}
      tabIndex={0}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsFocusedWithin(true)}
      onBlurCapture={handleBlur}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <link rel="preload" as="image" href={authShowcaseSlides[0].image} />
      <link rel="preload" as="image" href={authShowcaseSlides[nextPreloadIndex].image} />

      <div className="salo-intro-slides-stage">
        {authShowcaseSlides.map((slide, index) => {
          const isActive = index === activeIndex;
          return (
            <div
              className={`salo-intro-slide ${isActive ? 'active' : ''}`}
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${authShowcaseSlides.length}`}
              aria-hidden={!isActive}
            >
              {loadedSlides.has(index) && (
                <img
                  src={slide.image}
                  alt={slide.alt}
                  width="1200"
                  height="900"
                  loading={index === 0 ? 'eager' : 'lazy'}
                  fetchPriority={index === 0 ? 'high' : 'auto'}
                  style={{
                    objectPosition: slide.objectPosition,
                    '--kb-origin': slide.kenBurnsOrigin || 'center center',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="salo-intro-shade" aria-hidden="true" />

      <div className="salo-intro-bottom">
        <div className="salo-showcase-stage">
          {outgoingSlide && !reducedMotion && (
            <div
              className="salo-intro-caption salo-intro-caption--outgoing"
              key={`outgoing-${outgoingSlide.id}`}
              aria-hidden="true"
            >
              <div className="salo-mask-line">
                <span className="salo-intro-kicker">{outgoingSlide.kicker}</span>
              </div>
              <div className="salo-mask-line">
                <h2 className="salo-intro-headline">{outgoingSlide.headline}</h2>
              </div>
              <div className="salo-mask-line">
                <p className="salo-intro-subline">{outgoingSlide.subline}</p>
              </div>
            </div>
          )}

          <div
            className={`salo-intro-caption salo-intro-caption--incoming ${
              outgoingSlide ? 'is-transition-enter' : ''
            }`}
            key={activeSlide.id}
          >
            <div className="salo-mask-line">
              <span className="salo-intro-kicker">{activeSlide.kicker}</span>
            </div>
            <div className="salo-mask-line">
              {activeIndex === 0 ? (
                <h1 className="salo-intro-headline">{activeSlide.headline}</h1>
              ) : (
                <h2 className="salo-intro-headline">{activeSlide.headline}</h2>
              )}
            </div>
            <div className="salo-mask-line">
              <p className="salo-intro-subline">{activeSlide.subline}</p>
            </div>
          </div>

          <AuthShowcaseMiniCard
            key={`mini-${activeSlide.id}`}
            miniUi={activeSlide.miniUi}
            reducedMotion={reducedMotion}
            isTransitioning={Boolean(outgoingSlide)}
          />
        </div>

        <div className="salo-intro-controls">
          <div className="salo-intro-dots" role="group" aria-label="Choose a slide">
            {authShowcaseSlides.map((slide, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  type="button"
                  key={`${slide.id}-indicator`}
                  className={`salo-intro-dot ${isActive ? 'active' : ''}`}
                  aria-label={`Slide ${index + 1} of ${authShowcaseSlides.length}: ${slide.headline}`}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => showSlide(index)}
                >
                  {isActive && (
                    <span
                      key={`fill-${activeIndex}-${isAutoplaying ? 'play' : 'pause'}`}
                      className={`salo-intro-dot__fill ${isAutoplaying ? 'is-running' : 'is-paused'}`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage({ initialReducedMotion = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const isRegister = location.pathname === '/register';

  useEffect(() => {
    if (location.state?.newlyRegistered && isAuthenticated) {
      setWelcomeOpen(true);
    }
  }, [location.state, isAuthenticated]);

  const switchMode = () => {
    navigate(isRegister ? '/login' : '/register');
  };

  return (
    <main className="salo-split-page">
      {isAuthenticated && (
        <WelcomeModal open={welcomeOpen} onClose={() => setWelcomeOpen(false)} />
      )}

      <section className="salo-intro-panel" aria-label="SALO dining highlights">
        <AuthSlideshow initialReducedMotion={initialReducedMotion} />

        {/* Persistent top-left SALO icon + wordmark + tagline */}
        <div className="salo-intro-content">
          <div className="salo-intro-top">
            <BrandMark size="md" dark />
            <span className="salo-intro-tagline">{AUTH_SHOWCASE_CONFIG.tagline}</span>
          </div>

          {/* Compact mobile/tablet showcase summary (< 1024px: photo + headline + 4 chips, no mini-UI cards) */}
          <div className="salo-intro-compact-banner">
            <img
              className="salo-intro-compact-photo"
              src={authShowcaseSlides[0].image}
              alt=""
              aria-hidden="true"
              loading="eager"
            />
            <div className="salo-intro-compact-shade" aria-hidden="true" />
            <div className="salo-intro-compact-copy">
              <p className="salo-intro-compact-headline font-display">
                {AUTH_SHOWCASE_CONFIG.overviewHeadline}
              </p>
              <div className="salo-intro-compact-chips" aria-label="SALO key features">
                {AUTH_SHOWCASE_CONFIG.overviewChips.map((chip) => (
                  <span key={chip.id} className="salo-intro-compact-chip">
                    {chip.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="salo-auth-panel"
        aria-label={isRegister ? 'Create a SALO account' : 'Sign in to SALO'}
      >
        <div className="salo-auth-content">
          <div className="salo-auth-switch" role="tablist" aria-label="Account access">
            <span
              className={`salo-auth-switch-indicator ${isRegister ? 'is-register' : 'is-login'}`}
              aria-hidden="true"
            />
            <button
              type="button"
              role="tab"
              aria-selected={!isRegister}
              aria-pressed={!isRegister}
              className={!isRegister ? 'active' : ''}
              onClick={() => isRegister && switchMode()}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isRegister}
              aria-pressed={isRegister}
              className={isRegister ? 'active' : ''}
              onClick={() => !isRegister && switchMode()}
            >
              Create account
            </button>
          </div>

          <div
            className="salo-auth-form-stage"
            key={isRegister ? 'register-stage' : 'login-stage'}
          >
            {isRegister ? (
              <RegisterPage embedded onSwitch={switchMode} />
            ) : (
              <LoginPage embedded onSwitch={switchMode} />
            )}
          </div>
        </div>

        <p className="salo-auth-legal">
          By continuing, you agree to SALO&apos;s community guidelines.
        </p>
      </section>
    </main>
  );
}
