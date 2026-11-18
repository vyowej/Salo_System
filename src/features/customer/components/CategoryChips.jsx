import { useRef, useState, useEffect, useCallback, forwardRef } from 'react';

const CATEGORY_EMOJI_MAP = [
  { match: /^all$/i, emoji: '🍽️' },
  { match: /filipino|lutong|pinoy|kapampangan|ilocano|bicol/i, emoji: '🍲' },
  { match: /grill|bbq|inasal|barbecue|ihaw|roast/i, emoji: '🔥' },
  { match: /seafood|fish|crab|shrimp/i, emoji: '🦐' },
  { match: /noodle|ramen|pancit|lomi|mami|pasta/i, emoji: '🍜' },
  { match: /cafe|coffee|bakery|bread|pastry|merienda/i, emoji: '🥐' },
  { match: /dessert|sweet|halo|ice cream|cake/i, emoji: '🍧' },
  { match: /pizza|italian/i, emoji: '🍕' },
  { match: /japanese|sushi|korean|asian|chinese|thai/i, emoji: '🥢' },
  { match: /healthy|salad|vegan|vegetarian|organic/i, emoji: '🥗' },
  { match: /burger|fast|sandwich|chicken|wings/i, emoji: '🍔' },
  { match: /drink|tea|boba|juice|beverage/i, emoji: '🧋' },
  { match: /breakfast|silog|brunch/i, emoji: '🍳' },
];

function getCategoryEmoji(label = '') {
  const normalized = String(label).trim();
  for (const entry of CATEGORY_EMOJI_MAP) {
    if (entry.match.test(normalized)) {
      return entry.emoji;
    }
  }
  return '🍴';
}

const CategoryChips = forwardRef(function CategoryChips(
  { categories = [], activeCategory = 'All', onSelectCategory },
  sectionRef
) {
  const trackRef = useRef(null);
  const chipRefs = useRef({});
  const [pillStyle, setPillStyle] = useState({ width: 0, left: 0, ready: false });

  const allLabels = ['All', ...categories.map((cat) => (typeof cat === 'string' ? cat : cat.name)).filter(Boolean)];

  const updateActivePill = useCallback(() => {
    const activeBtn = chipRefs.current[activeCategory];
    const track = trackRef.current;
    if (!activeBtn || !track) return;

    setPillStyle({
      left: activeBtn.offsetLeft,
      width: activeBtn.offsetWidth,
      ready: true,
    });
  }, [activeCategory]);

  useEffect(() => {
    updateActivePill();
    window.addEventListener('resize', updateActivePill);
    return () => window.removeEventListener('resize', updateActivePill);
  }, [updateActivePill, allLabels.length]);

  const handleSelect = (label) => {
    onSelectCategory(label);
    const btn = chipRefs.current[label];
    if (btn && typeof btn.scrollIntoView === 'function') {
      btn.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }
  };

  return (
    <section
      ref={sectionRef}
      className="customer-categories-section customer-stagger-item"
      style={{ '--stagger-index': 2 }}
      aria-label="Filter by food category"
    >
      <div className="customer-categories-bar" ref={trackRef}>
        <span
          className={`customer-categories-pill-slider${pillStyle.ready ? ' is-ready' : ''}`}
          style={{
            width: `${pillStyle.width}px`,
            transform: `translate3d(${pillStyle.left}px, 0, 0)`,
          }}
          aria-hidden="true"
        />
        {allLabels.map((label) => {
          const isActive = activeCategory === label;
          return (
            <button
              key={label}
              ref={(node) => {
                if (node) {
                  chipRefs.current[label] = node;
                }
              }}
              type="button"
              className={`category-chip${isActive ? ' active' : ''}${pillStyle.ready ? ' has-slider' : ''}`}
              onClick={() => handleSelect(label)}
              aria-pressed={isActive}
            >
              <span className="category-chip__icon" aria-hidden="true">
                {getCategoryEmoji(label)}
              </span>
              <span className="category-chip__label">{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
});

export default CategoryChips;
