/**
 * Customer Onboarding Content Configuration
 * Role 1: Customer (collects phone number + default delivery address)
 */

export const CUSTOMER_ONBOARDING_CONTENT = {
  role: 'customer',
  roleBadge: 'Customer Account',
  steps: [
    {
      id: 'welcome',
      kind: 'welcome',
      titleTemplate: 'Welcome, {username}!',
      fallbackUsername: 'Friend',
      body: 'Handa ka na bang kumain? Ayusin muna natin ang account mo para mas mabilis ang pag-order mo.',
      highlights: [
        {
          id: 'fast-checkout',
          icon: 'phone',
          title: 'Reachable for updates',
          description: 'Receive quick calls or texts from riders and restaurants when your order is on the way.',
        },
        {
          id: 'nearby-kitchens',
          icon: 'pin',
          title: 'Default delivery address',
          description: 'See participating restaurants that deliver to your area and speed up checkout.',
        },
      ],
      primaryButton: 'Simulan na natin!',
      wholeSkipButton: 'Mamaya na lang',
    },
    {
      id: 'phone',
      kind: 'phone',
      title: 'Ano ang numero mo?',
      helper: 'Para matawagan ka ng rider o restaurant kapag may problema sa order mo.',
      fieldLabel: 'Philippine Mobile Number',
      fieldPlaceholder: '09171234567 or +639171234567',
      fieldHint: 'Accepted formats: 09XXXXXXXXX or +639XXXXXXXXX',
      validationError: 'Pakilagay ang tamang numero ng cellphone (hal. 09171234567).',
      saveErrorFallback: 'Unable to save your mobile number right now. Please try again.',
      primaryButton: 'Susunod',
      stepSkipButton: 'Laktawan muna',
      backButton: 'Bumalik',
    },
    {
      id: 'address',
      kind: 'address',
      title: 'Saan ka namin ihahatid?',
      helper: 'Idagdag ang address mo para makita namin ang mga restaurant na malapit sa iyo.',
      defaultAddressNote: 'Your first saved address will automatically be set as your default delivery address.',
      saveErrorFallback: 'Unable to save your delivery address right now. Please check the fields and try again.',
      primaryButton: 'I-save ang address',
      stepSkipButton: 'Laktawan muna',
      backButton: 'Bumalik',
    },
    {
      id: 'finish',
      kind: 'finish',
      title: 'Tapos na! Handa ka nang mag-order.',
      completedBody: 'Pwede mo pa itong baguhin anytime sa Settings.',
      skippedBody: 'Okay lang! Pwede mo itong dagdagan anytime sa Settings.',
      summaryLabels: {
        phoneSaved: 'Mobile number saved',
        phoneSkipped: 'Mobile number skipped for now',
        addressSaved: 'Default delivery address saved',
        addressSkipped: 'Delivery address skipped for now',
      },
      primaryButton: 'Kain na tayo!',
    },
  ],
};

export default CUSTOMER_ONBOARDING_CONTENT;
