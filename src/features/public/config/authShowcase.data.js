const slideReserveUrl = new URL('../../../assets/auth/slide-reserve.jpg', import.meta.url).href;

export const SLIDE_RESERVE_PHOTO = slideReserveUrl.startsWith('file:')
  ? '/src/assets/auth/slide-reserve.jpg'
  : slideReserveUrl;

export const AUTH_SHOWCASE_CONFIG = {
  tagline: 'ORDER. RESERVE. GATHER.',
  carouselAriaLabel: 'SALO platform showcase',
  autoplayDurationMs: 6500,
  textExitDurationMs: 250,
  overviewHeadline: 'Good food tastes better together.',
  overviewChips: [
    {
      id: 'multi-cart',
      label: 'Multi-restaurant cart',
      detail: 'Combine kitchens in one order',
      icon: 'cart',
    },
    {
      id: 'reservations',
      label: 'Table reservations',
      detail: 'Book by party size & time',
      icon: 'table',
    },
    {
      id: 'fulfillment',
      label: 'Delivery & pickup',
      detail: 'Flexible fulfillment per store',
      icon: 'delivery',
    },
    {
      id: 'cod',
      label: 'Cash on delivery',
      detail: 'Pay when your meal arrives',
      icon: 'cod',
    },
  ],
};

export const authShowcaseSlides = [
  {
    id: 'overview',
    kicker: 'Kain tayo!',
    headline: 'Good food tastes better together.',
    subline: 'Order from several kitchens in one checkout, reserve tables ahead, and gather over meals made to share.',
    image: '/images/landing/food-gathering.png',
    alt: 'Friends and family sharing dishes together around a dining table',
    objectPosition: 'center 38%',
    kenBurnsOrigin: 'center center',
    miniUi: {
      type: 'overview-chips',
      cardTitle: 'What you can do on SALO',
      cardBadge: 'All in one account',
      chips: AUTH_SHOWCASE_CONFIG.overviewChips,
    },
  },
  {
    id: 'multi-cart',
    kicker: 'ONE CHECKOUT',
    headline: 'Order from many kitchens.',
    subline: 'Mix dishes from different participating restaurants in one cart and place a single consolidated order.',
    image: '/images/landing/hero-food.png',
    alt: 'A spread of Filipino dishes from several kitchens',
    objectPosition: 'center 52%',
    kenBurnsOrigin: 'left center',
    miniUi: {
      type: 'multi-cart',
      cardTitle: 'Your cart',
      kitchenCountLabel: '3 kitchens',
      rows: [
        {
          id: 'cart-row-1',
          restaurant: 'Kusina Hiraya',
          item: '1× Crispy Kare-Kare',
          price: 320,
        },
        {
          id: 'cart-row-2',
          restaurant: 'Apag Inasal House',
          item: '1× Chicken Inasal Pecho',
          price: 185,
        },
        {
          id: 'cart-row-3',
          restaurant: 'Tamis & Co. Bakery',
          item: '1× Leche Flan Whole',
          price: 145,
        },
      ],
      totalLabel: 'Total',
      totalAmount: 650,
      ctaLabel: 'One checkout',
    },
  },
  {
    id: 'reservations',
    kicker: 'RESERVE',
    headline: 'Book a table in seconds.',
    subline: 'Choose your date, time, and guest count with real table capacity before you head out.',
    image: SLIDE_RESERVE_PHOTO,
    alt: 'Warmly lit restaurant dining room with tables ready for guests',
    objectPosition: 'center 55%',
    kenBurnsOrigin: 'right bottom',
    miniUi: {
      type: 'reservation',
      restaurant: 'Silong Dining Room',
      summary: 'Table for 4 / Sat / 7:00 PM',
      seatsLabel: '4 of 4 seats selected',
      seatCount: 4,
      badgeLabel: 'Confirmed',
      tableMeta: 'Table T-04 · Main Dining',
    },
  },
  {
    id: 'delivery',
    kicker: 'DELIVERY',
    headline: 'Meals, delivered.',
    subline: 'Track every stage to your doorstep, or choose pickup directly from the restaurant when you are nearby.',
    image: '/images/auth/login-food.png',
    alt: 'Savory braised chicken dish garnished with fresh scallions',
    objectPosition: 'center 48%',
    kenBurnsOrigin: 'center top',
    miniUi: {
      type: 'delivery-timeline',
      orderRef: '#ORD-4082',
      restaurant: 'Balsa Grill & Kitchen',
      fulfillmentNote: 'Delivery · Pickup also available',
      steps: [
        { key: 'accepted', label: 'Accepted' },
        { key: 'preparing', label: 'Preparing' },
        { key: 'out_for_delivery', label: 'Out for Delivery' },
        { key: 'delivered', label: 'Delivered' },
      ],
    },
  },
  {
    id: 'restaurants',
    kicker: 'FOR RESTAURANTS',
    headline: 'Run your kitchen from one place.',
    subline: 'Accept incoming customer orders, manage table reservations, and toggle menu item availability live.',
    image: '/images/landing/food-bg.png',
    alt: 'Overhead table spread of freshly prepared dishes ready for service',
    objectPosition: 'center 48%',
    kenBurnsOrigin: 'left bottom',
    miniUi: {
      type: 'restaurant-partner',
      cardTitle: 'New order',
      orderCode: '#ORD-5104',
      restaurant: 'Kalye Siete Bistro',
      orderSummary: '2× Garlic Beef Tapa · 1× Calamansi Iced Tea',
      orderTotal: '₱460 · Cash on delivery',
      actionLabel: 'Accept',
      acceptedLabel: 'Accepted',
      menuItemLabel: 'Sizzling Pork Sisig',
      menuStatusLabel: 'Available',
    },
  },
  {
    id: 'riders',
    kicker: 'FOR RIDERS',
    headline: 'Deliver and earn.',
    subline: 'Go online on your shift, accept nearby delivery offers, and record proof of delivery with clear COD tracking.',
    image: '/images/rider/rider-hero.png',
    alt: 'SALO delivery rider on a scooter ready for dispatch',
    objectPosition: 'center 45%',
    kenBurnsOrigin: 'right center',
    miniUi: {
      type: 'rider-partner',
      cardTitle: 'Available deliveries',
      routeTitle: 'Mesa Verde Kitchen → Brgy. San Antonio',
      distanceLabel: '2.4 km · Est. 15 min',
      codLabel: 'Collect ₱385 COD',
      feeLabel: '₱65 delivery fee',
      actionLabel: 'Accept',
      acceptedLabel: 'Accepted',
    },
  },
];

export function shouldCarouselAutoplay({
  reducedMotion = false,
  isPausedByUser = false,
  isHovered = false,
  isFocusedWithin = false,
  isTabHidden = false,
} = {}) {
  return Boolean(
    !reducedMotion &&
      !isPausedByUser &&
      !isHovered &&
      !isFocusedWithin &&
      !isTabHidden,
  );
}

export default authShowcaseSlides;
