// MOCK DATA ONLY — replace with real data later.
export const support = {
  categories: [
    'Delivery issue', 'Restaurant pickup issue', 'Customer issue', 'Payment or COD issue',
    'Account or application issue', 'GPS or application problem', 'Accident or safety incident', 'Other concerns',
  ],
  tickets: [
    {
      id: 'SAMPLE-TICKET-01',
      subject: 'Sample support request',
      category: 'Delivery issue',
      status: 'Under Review',
      updated: 'No recent activity',
      thread: [{ author: 'SALO Support', message: 'Support responses will appear in this thread.', time: '—' }],
    },
  ],
  emergency: {
    title: 'Emergency support',
    contact: 'Use local emergency services when there is immediate danger.',
    guidance: 'Stop in a safe place before contacting support. Do not interact with the app while driving.',
  },
};
