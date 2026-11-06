import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BrandMark from '../../../components/common/BrandMark';
import { useAuth } from '../../../hooks/useAuth';
import LoginPage from '../../auth/pages/LoginPage';
import RegisterPage from '../../auth/pages/RegisterPage';
import WelcomeModal from '../../auth/components/WelcomeModal';
import landingSlides from '../config/landingSlides';
import './LandingPage.css';

const AUTOPLAY_INTERVAL = 5500;

function AuthSlideshow() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadedSlides, setLoadedSlides] = useState(() => new Set([0]));
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [manualAnnouncement, setManualAnnouncement] = useState('');

  useEffect(() => {
    setLoadedSlides((loaded) => {
      if (loaded.has(activeIndex)) return loaded;
      return new Set([...loaded, activeIndex]);
    });
  }, [activeIndex]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);

    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (reducedMotion || isHovered || isFocused) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % landingSlides.length);
    }, AUTOPLAY_INTERVAL);

    return () => window.clearInterval(timer);
  }, [isHovered, isFocused, reducedMotion]);

  const showSlide = (index) => {
    const nextIndex = (index + landingSlides.length) % landingSlides.length;
    setActiveIndex(nextIndex);
    const slide = landingSlides[nextIndex];
    setManualAnnouncement(`${nextIndex + 1} of ${landingSlides.length}: ${slide.label}. ${slide.title}. ${slide.line}`);
  };

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
      setIsFocused(false);
    }
  };

  return (
    <div
      className="salo-intro-slideshow"
      role="region"
      aria-roledescription="carousel"
      aria-label="SALO food and dining highlights"
      tabIndex={0}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <link rel="preload" as="image" href={landingSlides[0].image} />
      {landingSlides.map((slide, index) => (
        <div
          className={`salo-intro-slide ${index === activeIndex ? 'active' : ''}`}
          key={`${slide.image}-${slide.title}`}
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${landingSlides.length}: ${slide.title}`}
          aria-hidden={index !== activeIndex}
        >
          {loadedSlides.has(index) && (
            <img
              src={slide.image}
              alt={slide.alt}
              loading={index === 0 ? 'eager' : 'lazy'}
              fetchPriority={index === 0 ? 'high' : 'auto'}
              style={{ objectPosition: slide.objectPosition }}
            />
          )}
        </div>
      ))}
      <div className="salo-intro-shade" />

      <div className="salo-intro-bottom">
        <h1>Good food tastes better together.</h1>
        <div className="salo-intro-caption" key={activeIndex}>
          <span>{landingSlides[activeIndex].label}</span>
          <h2>{landingSlides[activeIndex].title}</h2>
          <p>{landingSlides[activeIndex].line}</p>
        </div>

        <div className="salo-intro-controls">
          <div className="salo-intro-dots" aria-label="Choose a slide">
            {landingSlides.map((slide, index) => (
              <button
                type="button"
                key={`${slide.title}-indicator`}
                className={`salo-intro-dot ${index === activeIndex ? 'active' : ''}`}
                aria-label={`Go to slide ${index + 1}: ${slide.title}`}
                aria-current={index === activeIndex ? 'true' : undefined}
                onClick={() => showSlide(index)}
              />
            ))}
          </div>

          <div className="salo-intro-arrows">
            <button type="button" aria-label="Previous slide" onClick={() => showSlide(activeIndex - 1)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button type="button" aria-label="Next slide" onClick={() => showSlide(activeIndex + 1)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>

        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {manualAnnouncement}
        </span>
      </div>
    </div>
  );
}

export default function LandingPage() {
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
        <AuthSlideshow />
        <div className="salo-intro-content">
          <div className="salo-intro-top">
            <BrandMark size="md" dark />
            <span>ORDER. RESERVE. GATHER.</span>
          </div>
        </div>
      </section>

      <section className="salo-auth-panel" aria-label={isRegister ? 'Create a SALO account' : 'Sign in to SALO'}>
        <div className="salo-auth-top">
          <div className="salo-auth-brand-mobile">
            <BrandMark size="sm" tagline />
          </div>
        </div>

        <div className="salo-auth-content">
          <div className="salo-auth-switch" role="group" aria-label="Account access">
            <button
              type="button"
              aria-pressed={!isRegister}
              className={!isRegister ? 'active' : ''}
              onClick={() => isRegister && switchMode()}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={isRegister}
              className={isRegister ? 'active' : ''}
              onClick={() => !isRegister && switchMode()}
            >
              Create account
            </button>
          </div>

          {isRegister ? (
            <RegisterPage embedded onSwitch={switchMode} />
          ) : (
            <LoginPage embedded onSwitch={switchMode} />
          )}
        </div>

        <p className="salo-auth-legal">
          By continuing, you agree to SALO&apos;s community guidelines.
        </p>
      </section>
    </main>
  );
}
