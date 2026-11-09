// MOCK DATA ONLY - replace with real data later.
import { supportCategories } from '../constants/supportCategories';

export const support = {
  categories: supportCategories,
  tickets: [
    {
      id: 'TKT-2048',
      subject: 'Pickup handoff clarification',
      category: 'Delivery issue',
      status: 'under_review',
      updated: '2026-11-09T13:40:00+08:00',
      relatedDelivery: 'ORD-1042',
      thread: [
        { author: 'rider', message: 'The pickup counter was temporarily closed when I arrived.', time: '2026-11-09T12:55:00+08:00' },
        { author: 'support', message: 'Thanks for reporting this. We are checking the restaurant handoff notes.', time: '2026-11-09T13:40:00+08:00' },
      ],
    },
  ],
  relatedDeliveries: [
    { id: '', label: 'No related delivery' },
    { id: 'ORD-1042', label: 'ORD-1042 · Bahay ng Sawsawan' },
    { id: 'ORD-1029', label: 'ORD-1029 · Kusina ni Lola' },
  ],
  problemReviewTimeline: [
    { label: 'Report submitted', note: 'Local preview submission' },
    { label: 'Under Admin review', note: 'Review status is pending' },
  ],
  emergency: {
    title: 'Emergency support',
    contact: 'Use local emergency services when there is immediate danger.',
    guidance: 'Stop in a safe place before contacting support. Do not interact with the app while driving.',
  },
};
