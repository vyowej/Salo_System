import apiClient from './apiClient';

const BACKEND_STATUS_LABELS = {
  submitted: 'Submitted',
  pending_review: 'Pending Review',
  under_review: 'Under Review',
  additional_documents_required: 'Additional Documents Required',
  needs_correction: 'Needs Correction',
  resubmitted: 'Resubmitted',
  approved: 'Approved',
  rejected: 'Rejected',
};

export function mapBackendApplicationStatus(status) {
  if (!status) return null;
  return BACKEND_STATUS_LABELS[status] || status;
}

export const applicationService = {
  async getAccountApplications() {
    const response = await apiClient.get('/account/applications');
    return response?.data ?? null;
  },

  async submitRiderApplication(formData) {
    const response = await apiClient.post('/rider/applications', formData);
    return response?.data?.application ?? null;
  },

  async getCurrentRiderApplication() {
    const response = await apiClient.get('/rider/applications/current');
    return response?.data?.application ?? null;
  },

  async uploadRiderDocument(applicationId, { documentCode, requestId = null, file }) {
    const fd = new FormData();
    fd.append('document_code', documentCode);
    if (requestId) fd.append('request_id', String(requestId));
    fd.append('file', file);
    const response = await apiClient.post(`/rider/applications/${applicationId}/documents`, fd);
    return response?.data?.application ?? null;
  },

  async submitRestaurantApplication(formData) {
    const response = await apiClient.post('/restaurant/applications', formData);
    return response?.data?.application ?? null;
  },

  async getCurrentRestaurantApplication() {
    const response = await apiClient.get('/restaurant/applications/current');
    return response?.data?.application ?? null;
  },

  async uploadRestaurantDocument(applicationId, { documentCode, requestId = null, file }) {
    const fd = new FormData();
    fd.append('document_code', documentCode);
    if (requestId) fd.append('request_id', String(requestId));
    fd.append('file', file);
    const response = await apiClient.post(`/restaurant/applications/${applicationId}/documents`, fd);
    return response?.data?.application ?? null;
  },
};

export default applicationService;
